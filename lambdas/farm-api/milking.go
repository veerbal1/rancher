package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	maxCowsPerSession = 98
	milkingTime       = 2 * time.Minute
	sessionRunning    = "running"
	sessionStopped    = "stopped"
	cowWaiting        = "waiting"
)

type MilkingSession struct {
	ID            string       `json:"id"                 dynamodbav:"id"`
	FromPaddockID string       `json:"from_paddock_id"    dynamodbav:"from_paddock_id"`
	ShedID        string       `json:"shed_id"            dynamodbav:"shed_id"`
	ToPaddockID   string       `json:"to_paddock_id"      dynamodbav:"to_paddock_id"`
	Capacity      int          `json:"capacity"           dynamodbav:"capacity"`
	MilkingSecs   int          `json:"milking_secs"       dynamodbav:"milking_secs"`
	Status        string       `json:"status"             dynamodbav:"status"`
	InShed        int          `json:"in_shed"            dynamodbav:"in_shed"`
	Slot          string       `json:"slot,omitempty"     dynamodbav:"slot,omitempty"`
	StartedAt     string       `json:"started_at"         dynamodbav:"started_at"`
	EndedAt       string       `json:"ended_at,omitempty" dynamodbav:"ended_at,omitempty"`
	Cows          []SessionCow `json:"cows"               dynamodbav:"-"`
}

type SessionCow struct {
	CollarID    string `json:"collar_id"              dynamodbav:"collar_id"`
	Number      int    `json:"number"                 dynamodbav:"number"`
	Status      string `json:"status"                 dynamodbav:"status"`
	CalledAt    string `json:"called_at,omitempty"    dynamodbav:"called_at,omitempty"`
	MilkingFrom string `json:"milking_from,omitempty" dynamodbav:"milking_from,omitempty"`
	MilkingTo   string `json:"milking_to,omitempty"   dynamodbav:"milking_to,omitempty"`
}

type sessionItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	MilkingSession
}

type sessionCowItem struct {
	PK        string `dynamodbav:"PK"`
	SK        string `dynamodbav:"SK"`
	SessionID string `dynamodbav:"session_id"`
	SessionCow
}

func farmKey(farmerID, sk string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
		"SK": &types.AttributeValueMemberS{Value: sk},
	}
}

func startMilking(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		FromPaddockID string `json:"from_paddock_id"`
		ShedID        string `json:"shed_id"`
		ToPaddockID   string `json:"to_paddock_id"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.FromPaddockID == "" || in.ShedID == "" || in.ToPaddockID == "" || in.ShedID == in.FromPaddockID || in.ShedID == in.ToPaddockID {
		return respond(http.StatusBadRequest, errorBody("send from_paddock_id, shed_id and to_paddock_id, with the shed different from the other two"))
	}

	s, prob, err := beginSession(ctx, farmerID, rand.Text(), "", in.FromPaddockID, in.ShedID, in.ToPaddockID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if prob != nil {
		return respond(prob.status, errorBody(prob.msg))
	}
	return respond(http.StatusCreated, s)
}

type problem struct {
	status int
	msg    string
}

func beginSession(ctx context.Context, farmerID, id, slot, fromID, shedID, toID string) (*MilkingSession, *problem, error) {
	places := map[string]*Paddock{}
	for _, pid := range []string{fromID, shedID, toID} {
		p, err := getPaddock(ctx, farmerID, pid)
		if err != nil {
			return nil, nil, err
		}
		if p == nil {
			return nil, &problem{http.StatusNotFound, "paddock not found"}, nil
		}
		places[pid] = p
	}
	shed := places[shedID]
	if shed.Kind != kindMilkingShed {
		return nil, &problem{http.StatusBadRequest, shed.Name + " is not a milking shed"}, nil
	}
	for _, pid := range []string{fromID, toID} {
		if places[pid].Kind == kindMilkingShed {
			return nil, &problem{http.StatusBadRequest, "cows must come from and go to a paddock or a rest shed, not " + places[pid].Name}, nil
		}
	}
	for _, pair := range [][2]string{{fromID, shedID}, {shedID, toID}} {
		lane, err := findLane(ctx, farmerID, pair[0], pair[1])
		if err != nil {
			return nil, nil, err
		}
		if lane == nil {
			return nil, &problem{http.StatusBadRequest, fmt.Sprintf("draw a lane between %s and %s first", places[pair[0]].Name, places[pair[1]].Name)}, nil
		}
	}

	collars, err := collarsInPaddock(ctx, farmerID, fromID)
	if err != nil {
		return nil, nil, err
	}
	if len(collars) == 0 {
		return nil, &problem{http.StatusBadRequest, "there are no cows in " + places[fromID].Name}, nil
	}
	if len(collars) > maxCowsPerSession {
		return nil, &problem{http.StatusBadRequest, fmt.Sprintf("a milking can take at most %d cows", maxCowsPerSession)}, nil
	}

	capacity := shed.Capacity
	if capacity <= 0 {
		capacity = defaultShedCapacity
	}
	s := MilkingSession{
		ID:            id,
		Slot:          slot,
		FromPaddockID: fromID,
		ShedID:        shedID,
		ToPaddockID:   toID,
		Capacity:      capacity,
		MilkingSecs:   int(milkingTime / time.Second),
		Status:        sessionRunning,
		StartedAt:     time.Now().UTC().Format(time.RFC3339),
		Cows:          []SessionCow{},
	}
	item, err := attributevalue.MarshalMap(sessionItem{PK: "FARMER#" + farmerID, SK: "SESSION#" + s.ID, MilkingSession: s})
	if err != nil {
		return nil, nil, err
	}
	writes := []types.TransactWriteItem{
		{Put: &types.Put{TableName: aws.String(table), Item: item, ConditionExpression: aws.String("attribute_not_exists(PK)")}},
		{Update: &types.Update{
			TableName:                aws.String(table),
			Key:                      farmKey(farmerID, "PADDOCK#"+shedID),
			UpdateExpression:         aws.String("SET running_session = :id"),
			ConditionExpression:      aws.String("attribute_not_exists(running_session) AND #kind = :shed"),
			ExpressionAttributeNames: map[string]string{"#kind": "kind"},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":id":   &types.AttributeValueMemberS{Value: s.ID},
				":shed": &types.AttributeValueMemberS{Value: kindMilkingShed},
			},
		}},
	}
	for _, c := range collars {
		cow := SessionCow{CollarID: c.ID, Number: c.Number, Status: cowWaiting}
		ci, err := attributevalue.MarshalMap(sessionCowItem{PK: "FARMER#" + farmerID, SK: "SESSION#" + s.ID + "#COW#" + c.ID, SessionID: s.ID, SessionCow: cow})
		if err != nil {
			return nil, nil, err
		}
		writes = append(writes, types.TransactWriteItem{Put: &types.Put{TableName: aws.String(table), Item: ci}})
		s.Cows = append(s.Cows, cow)
	}

	_, err = db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writes})
	var cancelled *types.TransactionCanceledException
	if errors.As(err, &cancelled) {
		return nil, &problem{http.StatusConflict, "milking is already running in " + shed.Name}, nil
	}
	if err != nil {
		return nil, nil, err
	}
	return &s, nil, nil
}

func listMilkingSessions(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	sessions := map[string]*MilkingSession{}
	var cows []sessionCowItem
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "SESSION#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		for _, item := range page.Items {
			if strings.Contains(stringAttr(item["SK"]), "#COW#") {
				var c sessionCowItem
				if err := attributevalue.UnmarshalMap(item, &c); err != nil {
					return events.APIGatewayV2HTTPResponse{}, err
				}
				cows = append(cows, c)
				continue
			}
			var s MilkingSession
			if err := attributevalue.UnmarshalMap(item, &s); err != nil {
				return events.APIGatewayV2HTTPResponse{}, err
			}
			s.Cows = []SessionCow{}
			sessions[s.ID] = &s
		}
	}
	for _, c := range cows {
		if s := sessions[c.SessionID]; s != nil {
			s.Cows = append(s.Cows, c.SessionCow)
		}
	}

	list := make([]*MilkingSession, 0, len(sessions))
	for _, s := range sessions {
		sort.Slice(s.Cows, func(i, j int) bool { return s.Cows[i].Number < s.Cows[j].Number })
		list = append(list, s)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].StartedAt > list[j].StartedAt })
	return respond(http.StatusOK, list)
}

func stopMilking(ctx context.Context, farmerID, sessionID string) (events.APIGatewayV2HTTPResponse, error) {
	out, err := db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(table),
		Key:            farmKey(farmerID, "SESSION#"+sessionID),
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if out.Item == nil {
		return respond(http.StatusNotFound, errorBody("milking session not found"))
	}
	var s MilkingSession
	if err := attributevalue.UnmarshalMap(out.Item, &s); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if s.Status != sessionRunning {
		return respond(http.StatusConflict, errorBody("this milking has already ended"))
	}

	now := time.Now().UTC().Format(time.RFC3339)
	err = closeSession(ctx, farmerID, s, sessionStopped, now)
	var cancelled *types.TransactionCanceledException
	if errors.As(err, &cancelled) {
		return respond(http.StatusConflict, errorBody("this milking has already ended"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	s.Status, s.EndedAt, s.Cows = sessionStopped, now, []SessionCow{}
	return respond(http.StatusOK, s)
}

func closeSession(ctx context.Context, farmerID string, s MilkingSession, status, now string) error {
	_, err := db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: []types.TransactWriteItem{
		{Update: &types.Update{
			TableName:                aws.String(table),
			Key:                      farmKey(farmerID, "SESSION#"+s.ID),
			UpdateExpression:         aws.String("SET #status = :status, ended_at = :now"),
			ConditionExpression:      aws.String("#status = :running"),
			ExpressionAttributeNames: map[string]string{"#status": "status"},
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":status":  &types.AttributeValueMemberS{Value: status},
				":running": &types.AttributeValueMemberS{Value: sessionRunning},
				":now":     &types.AttributeValueMemberS{Value: now},
			},
		}},
		{Update: &types.Update{
			TableName:                 aws.String(table),
			Key:                       farmKey(farmerID, "PADDOCK#"+s.ShedID),
			UpdateExpression:          aws.String("REMOVE running_session"),
			ConditionExpression:       aws.String("running_session = :id"),
			ExpressionAttributeValues: map[string]types.AttributeValue{":id": &types.AttributeValueMemberS{Value: s.ID}},
		}},
	}})
	return err
}

func collarsInPaddock(ctx context.Context, farmerID, paddockID string) ([]Collar, error) {
	var collars []Collar
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		FilterExpression:       aws.String("paddock_id = :pid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "COLLAR#"},
			":pid":    &types.AttributeValueMemberS{Value: paddockID},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		var batch []Collar
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return nil, err
		}
		collars = append(collars, batch...)
	}
	sort.Slice(collars, func(i, j int) bool { return collars[i].Number < collars[j].Number })
	return collars, nil
}
