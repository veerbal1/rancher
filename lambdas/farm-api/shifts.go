package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"sort"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	shiftSpeedMS       = 0.5
	shiftLeadTime      = 10 * time.Second
	shiftGrace         = time.Minute
	maxCollarsPerShift = 99
)

type Shift struct {
	ID            string   `json:"id"              dynamodbav:"id"`
	FarmerID      string   `json:"farmer_id"       dynamodbav:"farmer_id"`
	FromPaddockID string   `json:"from_paddock_id" dynamodbav:"from_paddock_id"`
	ToPaddockID   string   `json:"to_paddock_id"   dynamodbav:"to_paddock_id"`
	CollarIDs     []string `json:"collar_ids"      dynamodbav:"collar_ids"`
	StartAt       string   `json:"start_at"        dynamodbav:"start_at"`
	SpeedMS       float64  `json:"speed_ms"        dynamodbav:"speed_ms"`
	ExpiresAt     string   `json:"expires_at"      dynamodbav:"expires_at"`
}

type shiftItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Shift
}

func (s Shift) active(now string) bool { return s.ExpiresAt > now }

func createShift(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		FromPaddockID string `json:"from_paddock_id"`
		ToPaddockID   string `json:"to_paddock_id"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.FromPaddockID == "" || in.ToPaddockID == "" || in.FromPaddockID == in.ToPaddockID {
		return respond(http.StatusBadRequest, errorBody("from_paddock_id and to_paddock_id must be two different paddocks"))
	}

	var rings [][][]float64
	for _, id := range []string{in.FromPaddockID, in.ToPaddockID} {
		p, err := getPaddock(ctx, farmerID, id)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		if p == nil {
			return respond(http.StatusNotFound, errorBody("paddock not found"))
		}
		rings = append(rings, p.Polygon.Coordinates[0])
	}

	now := time.Now().UTC()
	shifts, err := queryShifts(ctx, farmerID, now)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	for _, s := range shifts {
		for _, id := range []string{s.FromPaddockID, s.ToPaddockID} {
			if id == in.FromPaddockID || id == in.ToPaddockID {
				return respond(http.StatusConflict, errorBody("a shift is already running for one of these paddocks"))
			}
		}
	}

	collarIDs, err := collarIDsInPaddock(ctx, farmerID, in.FromPaddockID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if len(collarIDs) == 0 {
		return respond(http.StatusBadRequest, errorBody("no collars in that paddock"))
	}
	if len(collarIDs) > maxCollarsPerShift {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("a shift can move at most %d collars", maxCollarsPerShift)))
	}

	start := now.Add(shiftLeadTime)
	sweep := time.Duration(wallTravelM(rings[0], rings[1]) / shiftSpeedMS * float64(time.Second))
	s := Shift{
		ID:            rand.Text(),
		FarmerID:      farmerID,
		FromPaddockID: in.FromPaddockID,
		ToPaddockID:   in.ToPaddockID,
		CollarIDs:     collarIDs,
		StartAt:       start.Format(time.RFC3339),
		SpeedMS:       shiftSpeedMS,
		ExpiresAt:     start.Add(sweep + shiftGrace).Format(time.RFC3339),
	}
	item, err := attributevalue.MarshalMap(shiftItem{PK: "FARMER#" + farmerID, SK: "SHIFT#" + s.ID, Shift: s})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	writes := []types.TransactWriteItem{{Put: &types.Put{TableName: aws.String(table), Item: item}}}
	for _, id := range collarIDs {
		writes = append(writes, types.TransactWriteItem{Update: &types.Update{
			TableName: aws.String(table),
			Key: map[string]types.AttributeValue{
				"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
				"SK": &types.AttributeValueMemberS{Value: "COLLAR#" + id},
			},
			UpdateExpression:    aws.String("SET paddock_id = :to"),
			ConditionExpression: aws.String("paddock_id = :from"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":from": &types.AttributeValueMemberS{Value: in.FromPaddockID},
				":to":   &types.AttributeValueMemberS{Value: in.ToPaddockID},
			},
		}})
	}
	_, err = db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writes})
	var cancelled *types.TransactionCanceledException
	if errors.As(err, &cancelled) {
		return respond(http.StatusConflict, errorBody("collars changed while starting the shift, try again"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, s)
}

func listShifts(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	shifts, err := queryShifts(ctx, farmerID, time.Now().UTC())
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, shifts)
}

func queryShifts(ctx context.Context, farmerID string, now time.Time) ([]Shift, error) {
	shifts := []Shift{}
	nowStr := now.Format(time.RFC3339)
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "SHIFT#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		var batch []Shift
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return nil, err
		}
		for _, s := range batch {
			if s.active(nowStr) {
				shifts = append(shifts, s)
			}
		}
	}
	sort.Slice(shifts, func(i, j int) bool { return shifts[i].StartAt < shifts[j].StartAt })
	return shifts, nil
}

func getPaddock(ctx context.Context, farmerID, paddockID string) (*Paddock, error) {
	out, err := db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PADDOCK#" + paddockID},
		},
		ConsistentRead: aws.Bool(true),
	})
	if err != nil || out.Item == nil {
		return nil, err
	}
	var p Paddock
	if err := attributevalue.UnmarshalMap(out.Item, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func wallTravelM(fromRing, toRing [][]float64) float64 {
	const metresPerDeg = 111_320.0
	from, to := openRing(fromRing), openRing(toRing)
	origin, target := ringCenter(from), ringCenter(to)
	cosLat := math.Cos(origin[1] * math.Pi / 180)
	metres := func(p []float64) (float64, float64) {
		return (p[0] - origin[0]) * metresPerDeg * cosLat, (p[1] - origin[1]) * metresPerDeg
	}
	dx, dy := metres(target)
	l := math.Hypot(dx, dy)
	progress := func(p []float64) float64 {
		x, y := metres(p)
		return (x*dx + y*dy) / l
	}

	startM, stopM := math.Inf(1), math.Inf(1)
	for _, p := range append(slices.Clone(from), to...) {
		startM = math.Min(startM, progress(p))
	}
	for _, p := range to {
		stopM = math.Min(stopM, progress(p))
	}
	return math.Max(0, stopM-startM)
}

func openRing(ring [][]float64) [][]float64 {
	if n := len(ring); n > 1 && ring[0][0] == ring[n-1][0] && ring[0][1] == ring[n-1][1] {
		return ring[:n-1]
	}
	return ring
}

func ringCenter(pts [][]float64) []float64 {
	var lng, lat float64
	for _, p := range pts {
		lng += p[0]
		lat += p[1]
	}
	return []float64{lng / float64(len(pts)), lat / float64(len(pts))}
}

func collarIDsInPaddock(ctx context.Context, farmerID, paddockID string) ([]string, error) {
	var ids []string
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		ConsistentRead:         aws.Bool(true),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		FilterExpression:       aws.String("paddock_id = :pid"),
		ProjectionExpression:   aws.String("id"),
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
		for _, item := range page.Items {
			ids = append(ids, stringAttr(item["id"]))
		}
	}
	return ids, nil
}
