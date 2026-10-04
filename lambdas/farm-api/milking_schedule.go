package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	scheduleSK     = "SCHEDULE#milking"
	scheduleWindow = 15 * time.Minute
)

type MilkingSchedule struct {
	Enabled    bool   `json:"enabled"      dynamodbav:"enabled"`
	Timezone   string `json:"timezone"     dynamodbav:"timezone"`
	MorningAt  string `json:"morning_at"   dynamodbav:"morning_at"`
	EveningAt  string `json:"evening_at"   dynamodbav:"evening_at"`
	RestShedID string `json:"rest_shed_id" dynamodbav:"rest_shed_id"`
	ShedID     string `json:"shed_id"      dynamodbav:"shed_id"`
	PaddockID  string `json:"paddock_id"   dynamodbav:"paddock_id"`
	UpdatedAt  string `json:"updated_at"   dynamodbav:"updated_at"`
}

type scheduleItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	MilkingSchedule
}

type dueSlot struct {
	name, sessionID, from, to string
}

func dueSlots(sc MilkingSchedule, now time.Time) []dueSlot {
	if !sc.Enabled {
		return nil
	}
	loc, err := time.LoadLocation(sc.Timezone)
	if err != nil {
		return nil
	}
	local := now.In(loc)
	var due []dueSlot
	for _, slot := range []struct{ name, at, from, to string }{
		{"morning", sc.MorningAt, sc.RestShedID, sc.PaddockID},
		{"evening", sc.EveningAt, sc.PaddockID, sc.RestShedID},
	} {
		at, err := time.Parse("15:04", slot.at)
		if err != nil {
			continue
		}
		start := time.Date(local.Year(), local.Month(), local.Day(), at.Hour(), at.Minute(), 0, 0, loc)
		if !local.Before(start) && local.Before(start.Add(scheduleWindow)) {
			due = append(due, dueSlot{slot.name, start.Format("2006-01-02") + "-" + slot.name + "-" + start.Format("1504"), slot.from, slot.to})
		}
	}
	return due
}

func getMilkingSchedule(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	out, err := db.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(table), Key: farmKey(farmerID, scheduleSK)})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if out.Item == nil {
		return respond(http.StatusOK, nil)
	}
	var sc MilkingSchedule
	if err := attributevalue.UnmarshalMap(out.Item, &sc); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, sc)
}

func saveMilkingSchedule(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in MilkingSchedule
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if _, err := time.LoadLocation(in.Timezone); in.Timezone == "" || err != nil {
		return respond(http.StatusBadRequest, errorBody("timezone must be a name like Pacific/Auckland"))
	}
	for _, at := range []string{in.MorningAt, in.EveningAt} {
		if _, err := time.Parse("15:04", at); err != nil {
			return respond(http.StatusBadRequest, errorBody("times must look like 05:00"))
		}
	}
	if in.MorningAt == in.EveningAt {
		return respond(http.StatusBadRequest, errorBody("morning and evening must be at different times"))
	}
	if in.RestShedID == "" || in.ShedID == "" || in.PaddockID == "" || in.RestShedID == in.PaddockID {
		return respond(http.StatusBadRequest, errorBody("send rest_shed_id, shed_id and paddock_id, with a different rest shed and paddock"))
	}

	places := map[string]*Paddock{}
	for _, pid := range []string{in.RestShedID, in.ShedID, in.PaddockID} {
		p, err := getPaddock(ctx, farmerID, pid)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		if p == nil {
			return respond(http.StatusNotFound, errorBody("paddock not found"))
		}
		places[pid] = p
	}
	if places[in.ShedID].Kind != kindMilkingShed {
		return respond(http.StatusBadRequest, errorBody(places[in.ShedID].Name+" is not a milking shed"))
	}
	for _, pid := range []string{in.RestShedID, in.PaddockID} {
		if places[pid].Kind == kindMilkingShed {
			return respond(http.StatusBadRequest, errorBody("cows must come from and go to a paddock or a rest shed, not "+places[pid].Name))
		}
	}
	for _, pair := range [][2]string{{in.RestShedID, in.ShedID}, {in.ShedID, in.PaddockID}} {
		lane, err := findLane(ctx, farmerID, pair[0], pair[1])
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		if lane == nil {
			return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("draw a lane between %s and %s first", places[pair[0]].Name, places[pair[1]].Name)))
		}
	}

	in.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	item, err := attributevalue.MarshalMap(scheduleItem{PK: "FARMER#" + farmerID, SK: scheduleSK, MilkingSchedule: in})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, in)
}

func startDueSessions(ctx context.Context, now time.Time) {
	pages := dynamodb.NewScanPaginator(db, &dynamodb.ScanInput{
		TableName:                aws.String(table),
		FilterExpression:         aws.String("SK = :sk AND #enabled = :yes"),
		ExpressionAttributeNames: map[string]string{"#enabled": "enabled"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":sk":  &types.AttributeValueMemberS{Value: scheduleSK},
			":yes": &types.AttributeValueMemberBOOL{Value: true},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			log.Printf("find schedules: %v", err)
			return
		}
		for _, item := range page.Items {
			farmerID := strings.TrimPrefix(stringAttr(item["PK"]), "FARMER#")
			var sc MilkingSchedule
			if err := attributevalue.UnmarshalMap(item, &sc); err != nil {
				log.Printf("schedule for %s: %v", farmerID, err)
				continue
			}
			for _, slot := range dueSlots(sc, now) {
				out, err := db.GetItem(ctx, &dynamodb.GetItemInput{
					TableName:            aws.String(table),
					Key:                  farmKey(farmerID, "SESSION#"+slot.sessionID),
					ProjectionExpression: aws.String("PK"),
				})
				if err != nil {
					log.Printf("schedule %s %s: %v", farmerID, slot.name, err)
					continue
				}
				if out.Item != nil {
					continue
				}
				s, prob, err := beginSession(ctx, farmerID, slot.sessionID, slot.name, slot.from, sc.ShedID, slot.to)
				switch {
				case err != nil:
					log.Printf("schedule %s %s: %v", farmerID, slot.name, err)
				case prob != nil:
					log.Printf("schedule %s %s: %s", farmerID, slot.name, prob.msg)
				default:
					log.Printf("schedule %s %s: started session %s with %d cows", farmerID, slot.name, s.ID, len(s.Cows))
				}
			}
		}
	}
}
