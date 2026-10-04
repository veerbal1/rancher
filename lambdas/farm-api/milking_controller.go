package main

import (
	"context"
	"errors"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	cowCalled   = "called"
	cowMilking  = "milking"
	cowDone     = "done"
	cowMissed   = "missed"
	sessionDone = "done"

	callTimeout      = 15 * time.Minute
	milkingPasses    = 4
	milkingPassEvery = 15 * time.Second
)

type cowReading struct {
	Lng, Lat float64
	State    string
	At       time.Time
}

type milkingAction struct {
	Kind     string
	CollarID string
	Move     bool
	From     string
}

func decideMilking(s MilkingSession, collarPaddock map[string]string, readings map[string]cowReading, shedRing [][]float64, now time.Time) []milkingAction {
	fresh := func(id string) (cowReading, bool) {
		r, ok := readings[id]
		return r, ok && now.Sub(r.At) < readingFreshFor
	}

	var actions []milkingAction
	inShed, open := 0, false
	for _, c := range s.Cows {
		switch c.Status {
		case cowWaiting:
			open = true
		case cowCalled:
			open = true
			r, ok := fresh(c.CollarID)
			switch {
			case ok && ringContains(shedRing, []float64{r.Lng, r.Lat}):
				actions = append(actions, milkingAction{Kind: "arrive", CollarID: c.CollarID})
				inShed++
			case collarPaddock[c.CollarID] != s.ShedID || elapsed(c.CalledAt, now) > callTimeout:
				actions = append(actions, milkingAction{Kind: "miss", CollarID: c.CollarID, From: cowCalled})
			default:
				inShed++
			}
		case cowMilking:
			open = true
			if elapsed(c.MilkingFrom, now) >= time.Duration(s.MilkingSecs)*time.Second {
				actions = append(actions, milkingAction{Kind: "finish", CollarID: c.CollarID, Move: collarPaddock[c.CollarID] == s.ShedID})
			} else {
				inShed++
			}
		}
	}

	free := s.Capacity - inShed
	for _, c := range s.Cows {
		if c.Status != cowWaiting {
			continue
		}
		if collarPaddock[c.CollarID] != s.FromPaddockID {
			actions = append(actions, milkingAction{Kind: "miss", CollarID: c.CollarID, From: cowWaiting})
			continue
		}
		if r, ok := fresh(c.CollarID); free > 0 && ok && r.State != "moving" {
			actions = append(actions, milkingAction{Kind: "call", CollarID: c.CollarID})
			free--
		}
	}

	if !open {
		actions = append(actions, milkingAction{Kind: "end"})
	}
	return actions
}

func elapsed(ts string, now time.Time) time.Duration {
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return 0
	}
	return now.Sub(t)
}

type sessionRef struct {
	farmerID, id string
}

type walk struct {
	from, to string
	lane     *Lane
}

type cowStep struct {
	collarID   string
	from, to   string
	stampField string
	inShed     int
	walk       *walk
}

func runMilking(ctx context.Context) error {
	for pass := 0; pass < milkingPasses; pass++ {
		if pass > 0 {
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(milkingPassEvery):
			}
		}
		if pass == 0 {
			startDueSessions(ctx, time.Now().UTC())
		}
		running, err := runningSessions(ctx)
		if err != nil {
			log.Printf("find running sessions: %v", err)
			return nil
		}
		if len(running) == 0 {
			return nil
		}
		for _, r := range running {
			if err := advanceSession(ctx, r.farmerID, r.id, time.Now().UTC()); err != nil {
				log.Printf("session %s: %v", r.id, err)
			}
		}
	}
	return nil
}

func runningSessions(ctx context.Context) ([]sessionRef, error) {
	var running []sessionRef
	pages := dynamodb.NewScanPaginator(db, &dynamodb.ScanInput{
		TableName:                aws.String(table),
		FilterExpression:         aws.String("begins_with(SK, :prefix) AND #status = :running"),
		ProjectionExpression:     aws.String("PK, id"),
		ExpressionAttributeNames: map[string]string{"#status": "status"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":prefix":  &types.AttributeValueMemberS{Value: "SESSION#"},
			":running": &types.AttributeValueMemberS{Value: sessionRunning},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			running = append(running, sessionRef{strings.TrimPrefix(stringAttr(item["PK"]), "FARMER#"), stringAttr(item["id"])})
		}
	}
	return running, nil
}

func advanceSession(ctx context.Context, farmerID, sessionID string, now time.Time) error {
	s, err := loadSession(ctx, farmerID, sessionID)
	if err != nil || s == nil || s.Status != sessionRunning {
		return err
	}
	shed, err := getPaddock(ctx, farmerID, s.ShedID)
	if err != nil || shed == nil {
		return err
	}
	collars, err := collarPaddocks(ctx, farmerID)
	if err != nil {
		return err
	}
	readings, err := cowReadings(ctx, farmerID)
	if err != nil {
		return err
	}

	lanes := map[[2]string]*Lane{}
	walkTo := func(from, to string) (*walk, error) {
		key := [2]string{from, to}
		if _, ok := lanes[key]; !ok {
			l, err := findLane(ctx, farmerID, from, to)
			if err != nil {
				return nil, err
			}
			lanes[key] = l
		}
		if lanes[key] == nil {
			return nil, errors.New("no saved lane")
		}
		return &walk{from, to, lanes[key]}, nil
	}

	stamp := now.Format(time.RFC3339)
	for _, a := range decideMilking(*s, collars, readings, shed.Polygon.Coordinates[0], now) {
		var err error
		step := cowStep{collarID: a.CollarID}
		switch a.Kind {
		case "call":
			step.from, step.to, step.stampField, step.inShed = cowWaiting, cowCalled, "called_at", 1
			step.walk, err = walkTo(s.FromPaddockID, s.ShedID)
		case "arrive":
			step.from, step.to, step.stampField = cowCalled, cowMilking, "milking_from"
		case "finish":
			step.from, step.to, step.stampField, step.inShed = cowMilking, cowDone, "milking_to", -1
			if a.Move {
				step.walk, err = walkTo(s.ShedID, s.ToPaddockID)
			}
		case "miss":
			step.from, step.to = a.From, cowMissed
			if a.From == cowCalled {
				step.inShed = -1
			}
		}
		if err == nil {
			if a.Kind == "end" {
				err = closeSession(ctx, farmerID, *s, sessionDone, stamp)
			} else {
				err = applyStep(ctx, farmerID, s.ID, step, now)
			}
		}
		if err != nil {
			log.Printf("session %s: %s %s: %v", sessionID, a.Kind, a.CollarID, err)
			continue
		}
		log.Printf("session %s: %s %s", sessionID, a.Kind, a.CollarID)
	}
	return nil
}

func applyStep(ctx context.Context, farmerID, sessionID string, step cowStep, now time.Time) error {
	set := "SET #status = :to"
	values := map[string]types.AttributeValue{
		":from": &types.AttributeValueMemberS{Value: step.from},
		":to":   &types.AttributeValueMemberS{Value: step.to},
	}
	if step.stampField != "" {
		set += ", " + step.stampField + " = :stamp"
		values[":stamp"] = &types.AttributeValueMemberS{Value: now.Format(time.RFC3339)}
	}
	writes := []types.TransactWriteItem{{Update: &types.Update{
		TableName:                 aws.String(table),
		Key:                       farmKey(farmerID, "SESSION#"+sessionID+"#COW#"+step.collarID),
		UpdateExpression:          aws.String(set),
		ConditionExpression:       aws.String("#status = :from"),
		ExpressionAttributeNames:  map[string]string{"#status": "status"},
		ExpressionAttributeValues: values,
	}}}

	if step.inShed != 0 {
		count := &types.Update{
			TableName:        aws.String(table),
			Key:              farmKey(farmerID, "SESSION#"+sessionID),
			UpdateExpression: aws.String("ADD in_shed :delta"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":delta": &types.AttributeValueMemberN{Value: strconv.Itoa(step.inShed)},
			},
		}
		if step.inShed > 0 {
			count.ConditionExpression = aws.String("#status = :running AND in_shed < #capacity")
			count.ExpressionAttributeNames = map[string]string{"#status": "status", "#capacity": "capacity"}
			count.ExpressionAttributeValues[":running"] = &types.AttributeValueMemberS{Value: sessionRunning}
		} else {
			count.ConditionExpression = aws.String("in_shed > :zero")
			count.ExpressionAttributeValues[":zero"] = &types.AttributeValueMemberN{Value: "0"}
		}
		writes = append(writes, types.TransactWriteItem{Update: count})
	}

	if step.walk != nil {
		shift := newShift(farmerID, step.walk.from, step.walk.to, []string{step.collarID}, step.walk.lane.Path, step.walk.lane.WidthM, now)
		shift.SessionID = sessionID
		moves, err := shiftWrites(farmerID, shift)
		if err != nil {
			return err
		}
		writes = append(writes, moves...)
	}

	_, err := db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writes})
	return err
}

func loadSession(ctx context.Context, farmerID, sessionID string) (*MilkingSession, error) {
	var s *MilkingSession
	var cows []SessionCow
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "SESSION#" + sessionID},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			switch sk := stringAttr(item["SK"]); {
			case sk == "SESSION#"+sessionID:
				s = &MilkingSession{}
				if err := attributevalue.UnmarshalMap(item, s); err != nil {
					return nil, err
				}
			case strings.HasPrefix(sk, "SESSION#"+sessionID+"#COW#"):
				var c SessionCow
				if err := attributevalue.UnmarshalMap(item, &c); err != nil {
					return nil, err
				}
				cows = append(cows, c)
			}
		}
	}
	if s == nil {
		return nil, nil
	}
	sort.Slice(cows, func(i, j int) bool { return cows[i].Number < cows[j].Number })
	s.Cows = cows
	return s, nil
}

func collarPaddocks(ctx context.Context, farmerID string) (map[string]string, error) {
	paddocks := map[string]string{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "COLLAR#"},
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
		for _, c := range batch {
			if c.PaddockID != nil {
				paddocks[c.ID] = *c.PaddockID
			}
		}
	}
	return paddocks, nil
}

func cowReadings(ctx context.Context, farmerID string) (map[string]cowReading, error) {
	readings := map[string]cowReading{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:                aws.String(cowTable),
		KeyConditionExpression:   aws.String("farmer_id = :f"),
		ProjectionExpression:     aws.String("collar_id, lat, lng, #s, #t"),
		ExpressionAttributeNames: map[string]string{"#s": "state", "#t": "time"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":f": &types.AttributeValueMemberS{Value: farmerID},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.Items {
			var r struct {
				CollarID string  `dynamodbav:"collar_id"`
				Lat      float64 `dynamodbav:"lat"`
				Lng      float64 `dynamodbav:"lng"`
				State    string  `dynamodbav:"state"`
				Time     string  `dynamodbav:"time"`
			}
			if err := attributevalue.UnmarshalMap(item, &r); err != nil {
				return nil, err
			}
			at, err := time.Parse(time.RFC3339Nano, r.Time)
			if err != nil {
				continue
			}
			readings[r.CollarID] = cowReading{Lng: r.Lng, Lat: r.Lat, State: r.State, At: at}
		}
	}
	return readings, nil
}
