package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type Mob struct {
	ID        string `json:"id"         dynamodbav:"id"`
	FarmerID  string `json:"farmer_id"  dynamodbav:"farmer_id"`
	Name      string `json:"name"       dynamodbav:"name"`
	Color     string `json:"color"      dynamodbav:"color"`
	CreatedAt string `json:"created_at" dynamodbav:"created_at"`
}

type mobItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Mob
}

func createMob(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 100 {
		return respond(http.StatusBadRequest, errorBody("name must be 1-100 characters"))
	}
	if !hexColor.MatchString(in.Color) {
		return respond(http.StatusBadRequest, errorBody("color must look like #22c55e"))
	}

	m := Mob{ID: rand.Text(), FarmerID: farmerID, Name: name, Color: strings.ToLower(in.Color), CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	item, err := attributevalue.MarshalMap(mobItem{PK: "FARMER#" + farmerID, SK: "MOB#" + m.ID, Mob: m})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, m)
}

func listMobs(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	mobs := []Mob{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "MOB#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		var batch []Mob
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		mobs = append(mobs, batch...)
	}
	sort.Slice(mobs, func(i, j int) bool { return mobs[i].CreatedAt < mobs[j].CreatedAt })
	return respond(http.StatusOK, mobs)
}
