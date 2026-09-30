package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	shiftLeadTime      = 10 * time.Second
	shiftWalkMS        = 0.8
	shiftGrace         = 3 * time.Minute
	shiftStartupGrace  = 30 * time.Second
	readingFreshFor    = 10 * time.Second
	maxCollarsPerShift = 98
	maxPathPoints      = 100
	defaultLaneWidthM  = 8.0
	minLaneWidthM      = 3.0
	maxLaneWidthM      = 30.0
)

type LineString struct {
	Type        string      `json:"type"        dynamodbav:"type"`
	Coordinates [][]float64 `json:"coordinates" dynamodbav:"coordinates"`
}

type Shift struct {
	ID            string     `json:"id"              dynamodbav:"id"`
	FarmerID      string     `json:"farmer_id"       dynamodbav:"farmer_id"`
	FromPaddockID string     `json:"from_paddock_id" dynamodbav:"from_paddock_id"`
	ToPaddockID   string     `json:"to_paddock_id"   dynamodbav:"to_paddock_id"`
	CollarIDs     []string   `json:"collar_ids"      dynamodbav:"collar_ids"`
	Path          LineString `json:"path"            dynamodbav:"path"`
	WidthM        float64    `json:"width_m"         dynamodbav:"width_m"`
	StartAt       string     `json:"start_at"        dynamodbav:"start_at"`
	ExpiresAt     string     `json:"expires_at"      dynamodbav:"expires_at"`
}

type shiftItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Shift
}

func (s Shift) active(now string) bool { return s.ExpiresAt > now }

func (s Shift) running(now time.Time, moving map[string]bool) bool {
	if !s.active(now.Format(time.RFC3339)) {
		return false
	}
	start, err := time.Parse(time.RFC3339, s.StartAt)
	if err != nil || now.Before(start.Add(shiftStartupGrace)) {
		return true
	}
	for _, id := range s.CollarIDs {
		if moving[id] {
			return true
		}
	}
	return false
}

func movingCollars(ctx context.Context, farmerID string, now time.Time) (map[string]bool, error) {
	moving := map[string]bool{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:                aws.String(cowTable),
		KeyConditionExpression:   aws.String("farmer_id = :f"),
		ProjectionExpression:     aws.String("collar_id, #s, #t"),
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
			at, err := time.Parse(time.RFC3339Nano, stringAttr(item["time"]))
			if err == nil && now.Sub(at) < readingFreshFor && stringAttr(item["state"]) == "moving" {
				moving[stringAttr(item["collar_id"])] = true
			}
		}
	}
	return moving, nil
}

func createShift(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		FromPaddockID string     `json:"from_paddock_id"`
		ToPaddockID   string     `json:"to_paddock_id"`
		Path          LineString `json:"path"`
		WidthM        float64    `json:"width_m"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.FromPaddockID == "" || in.ToPaddockID == "" || in.FromPaddockID == in.ToPaddockID {
		return respond(http.StatusBadRequest, errorBody("from_paddock_id and to_paddock_id must be two different paddocks"))
	}
	if in.WidthM == 0 {
		in.WidthM = defaultLaneWidthM
	}
	if in.WidthM < minLaneWidthM || in.WidthM > maxLaneWidthM {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("width_m must be %.0f-%.0f", minLaneWidthM, maxLaneWidthM)))
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
	if msg := validatePath(in.Path, rings[0], rings[1]); msg != "" {
		return respond(http.StatusBadRequest, errorBody(msg))
	}

	now := time.Now().UTC()
	shifts, err := queryShifts(ctx, farmerID, now)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	var moving map[string]bool
	if len(shifts) > 0 {
		if moving, err = movingCollars(ctx, farmerID, now); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
	}
	for _, s := range shifts {
		if !s.running(now, moving) {
			continue
		}
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
	walk := time.Duration(pathLengthM(in.Path.Coordinates) / shiftWalkMS * float64(time.Second))
	s := Shift{
		ID:            rand.Text(),
		FarmerID:      farmerID,
		FromPaddockID: in.FromPaddockID,
		ToPaddockID:   in.ToPaddockID,
		CollarIDs:     collarIDs,
		Path:          in.Path,
		WidthM:        in.WidthM,
		StartAt:       start.Format(time.RFC3339),
		ExpiresAt:     start.Add(walk + shiftGrace).Format(time.RFC3339),
	}
	item, err := attributevalue.MarshalMap(shiftItem{PK: "FARMER#" + farmerID, SK: "SHIFT#" + s.ID, Shift: s})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	writes := []types.TransactWriteItem{{Put: &types.Put{TableName: aws.String(table), Item: item}}}
	for _, id := range collarIDs {
		writes = append(writes, moveCollar(farmerID, id, in.FromPaddockID, in.ToPaddockID))
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

func turnBackShift(ctx context.Context, farmerID, shiftID string) (events.APIGatewayV2HTTPResponse, error) {
	out, err := db.GetItem(ctx, &dynamodb.GetItemInput{
		TableName:      aws.String(table),
		Key:            shiftKey(farmerID, shiftID),
		ConsistentRead: aws.Bool(true),
	})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if out.Item == nil {
		return respond(http.StatusNotFound, errorBody("shift not found"))
	}
	var old Shift
	if err := attributevalue.UnmarshalMap(out.Item, &old); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	if !old.active(nowStr) {
		return respond(http.StatusConflict, errorBody("this move has already finished"))
	}

	var writes []types.TransactWriteItem
	var back *Shift
	if nowStr < old.StartAt {
		writes = append(writes, types.TransactWriteItem{Delete: &types.Delete{TableName: aws.String(table), Key: shiftKey(farmerID, shiftID)}})
	} else {
		reversed := make([][]float64, len(old.Path.Coordinates))
		for i, pt := range old.Path.Coordinates {
			reversed[len(reversed)-1-i] = pt
		}
		walk := time.Duration(pathLengthM(reversed) / shiftWalkMS * float64(time.Second))
		back = &Shift{
			ID:            rand.Text(),
			FarmerID:      farmerID,
			FromPaddockID: old.ToPaddockID,
			ToPaddockID:   old.FromPaddockID,
			CollarIDs:     old.CollarIDs,
			Path:          LineString{Type: "LineString", Coordinates: reversed},
			WidthM:        old.WidthM,
			StartAt:       nowStr,
			ExpiresAt:     now.Add(walk + shiftGrace).Format(time.RFC3339),
		}
		item, err := attributevalue.MarshalMap(shiftItem{PK: "FARMER#" + farmerID, SK: "SHIFT#" + back.ID, Shift: *back})
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		writes = append(writes,
			types.TransactWriteItem{Update: &types.Update{
				TableName:           aws.String(table),
				Key:                 shiftKey(farmerID, shiftID),
				UpdateExpression:    aws.String("SET expires_at = :now"),
				ConditionExpression: aws.String("expires_at = :expires"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":now":     &types.AttributeValueMemberS{Value: nowStr},
					":expires": &types.AttributeValueMemberS{Value: old.ExpiresAt},
				},
			}},
			types.TransactWriteItem{Put: &types.Put{TableName: aws.String(table), Item: item}},
		)
	}
	for _, id := range old.CollarIDs {
		writes = append(writes, moveCollar(farmerID, id, old.ToPaddockID, old.FromPaddockID))
	}

	_, err = db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: writes})
	var cancelled *types.TransactionCanceledException
	if errors.As(err, &cancelled) {
		return respond(http.StatusConflict, errorBody("the herd changed while turning back, refresh and try again"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if back == nil {
		return respond(http.StatusOK, map[string]any{"cancelled": shiftID})
	}
	return respond(http.StatusCreated, map[string]any{"ended": shiftID, "shift": back})
}

func shiftKey(farmerID, shiftID string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
		"SK": &types.AttributeValueMemberS{Value: "SHIFT#" + shiftID},
	}
}

func moveCollar(farmerID, collarID, from, to string) types.TransactWriteItem {
	return types.TransactWriteItem{Update: &types.Update{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "COLLAR#" + collarID},
		},
		UpdateExpression:    aws.String("SET paddock_id = :to"),
		ConditionExpression: aws.String("paddock_id = :from"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":from": &types.AttributeValueMemberS{Value: from},
			":to":   &types.AttributeValueMemberS{Value: to},
		},
	}}
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

func validatePath(p LineString, from, to [][]float64) string {
	if p.Type != "LineString" || len(p.Coordinates) < 2 || len(p.Coordinates) > maxPathPoints {
		return fmt.Sprintf("path must be a GeoJSON LineString with 2 to %d points", maxPathPoints)
	}
	for _, pt := range p.Coordinates {
		if len(pt) != 2 || pt[0] < -180 || pt[0] > 180 || pt[1] < -90 || pt[1] > 90 {
			return "path has an invalid coordinate"
		}
	}
	if !ringContains(from, p.Coordinates[0]) {
		return "path must start inside the paddock the herd is leaving"
	}
	if !ringContains(to, p.Coordinates[len(p.Coordinates)-1]) {
		return "path must end inside the destination paddock"
	}
	return ""
}

func ringContains(ring [][]float64, pt []float64) bool {
	inside := false
	for i, j := 0, len(ring)-1; i < len(ring); j, i = i, i+1 {
		a, b := ring[i], ring[j]
		if (a[1] > pt[1]) != (b[1] > pt[1]) && pt[0] < (b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0] {
			inside = !inside
		}
	}
	return inside
}

func pathLengthM(pts [][]float64) float64 {
	const metresPerDeg = 111_320.0
	total := 0.0
	for i := 1; i < len(pts); i++ {
		a, b := pts[i-1], pts[i]
		k := metresPerDeg * math.Cos(a[1]*math.Pi/180)
		total += math.Hypot((b[0]-a[0])*k, (b[1]-a[1])*metresPerDeg)
	}
	return total
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
