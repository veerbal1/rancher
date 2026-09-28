package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const maxCollarsPerPurchase = 50

type Collar struct {
	ID        string  `json:"id"         dynamodbav:"id"`
	FarmerID  string  `json:"farmer_id"  dynamodbav:"farmer_id"`
	Number    int     `json:"number"     dynamodbav:"number"`
	Name      string  `json:"name"       dynamodbav:"name"`
	PaddockID *string `json:"paddock_id" dynamodbav:"paddock_id"`
	CreatedAt string  `json:"created_at" dynamodbav:"created_at"`
}

type collarItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Collar
}

func createCollars(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.Count < 1 || in.Count > maxCollarsPerPurchase {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("count must be 1-%d", maxCollarsPerPurchase)))
	}

	last, err := reserveCollarNumbers(ctx, farmerID, in.Count)
	var notFound *types.ConditionalCheckFailedException
	if errors.As(err, &notFound) {
		return respond(http.StatusNotFound, errorBody("farmer not found"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	collars := make([]Collar, 0, in.Count)
	puts := make([]types.TransactWriteItem, 0, in.Count)
	for n := last - in.Count + 1; n <= last; n++ {
		c := Collar{ID: rand.Text(), FarmerID: farmerID, Number: n, Name: fmt.Sprintf("Collar #%d", n), CreatedAt: now}
		item, err := attributevalue.MarshalMap(collarItem{PK: "FARMER#" + farmerID, SK: "COLLAR#" + c.ID, Collar: c})
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		collars = append(collars, c)
		puts = append(puts, types.TransactWriteItem{Put: &types.Put{TableName: aws.String(table), Item: item}})
	}
	if _, err := db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: puts}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, collars)
}

func reserveCollarNumbers(ctx context.Context, farmerID string, count int) (int, error) {
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PROFILE"},
		},
		UpdateExpression:          aws.String("ADD collar_count :n"),
		ConditionExpression:       aws.String("attribute_exists(PK)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":n": &types.AttributeValueMemberN{Value: strconv.Itoa(count)}},
		ReturnValues:              types.ReturnValueUpdatedNew,
	})
	if err != nil {
		return 0, err
	}
	var counter struct {
		CollarCount int `dynamodbav:"collar_count"`
	}
	if err := attributevalue.UnmarshalMap(out.Attributes, &counter); err != nil {
		return 0, err
	}
	return counter.CollarCount, nil
}

func listCollars(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	collars := []Collar{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "COLLAR#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		var batch []Collar
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		collars = append(collars, batch...)
	}

	sort.Slice(collars, func(i, j int) bool { return collars[i].Number < collars[j].Number })
	return respond(http.StatusOK, collars)
}
