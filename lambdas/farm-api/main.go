package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Location struct {
	Lng float64 `json:"lng" dynamodbav:"lng"`
	Lat float64 `json:"lat" dynamodbav:"lat"`
}

type Farmer struct {
	ID        string    `json:"id"                 dynamodbav:"id"`
	Name      string    `json:"name"               dynamodbav:"name"`
	Location  *Location `json:"location,omitempty" dynamodbav:"location,omitempty"`
	CreatedAt string    `json:"created_at"         dynamodbav:"created_at"`
}

type farmerItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Farmer
}

var (
	db    *dynamodb.Client
	table = os.Getenv("TABLE_NAME")
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	db = dynamodb.NewFromConfig(cfg)
	lambda.Start(handle)
}

func handle(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	switch req.RouteKey {
	case "POST /farmers":
		return createFarmer(ctx, req.Body)
	case "GET /farmers":
		return listFarmers(ctx)
	case "POST /farmers/{id}/paddocks":
		return createPaddock(ctx, req.PathParameters["id"], req.Body)
	case "GET /farmers/{id}/paddocks":
		return listPaddocks(ctx, req.PathParameters["id"])
	case "PATCH /farmers/{id}/paddocks/{paddockId}":
		return renamePaddock(ctx, req.PathParameters["id"], req.PathParameters["paddockId"], req.Body)
	case "DELETE /farmers/{id}/paddocks/{paddockId}":
		return deletePaddock(ctx, req.PathParameters["id"], req.PathParameters["paddockId"])
	default:
		return respond(http.StatusNotFound, errorBody("not found"))
	}
}

func createFarmer(ctx context.Context, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Name     string    `json:"name"`
		Location *Location `json:"location"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || len(name) > 100 {
		return respond(http.StatusBadRequest, errorBody("name must be 1-100 characters"))
	}
	loc := in.Location
	if loc == nil || loc.Lng < -180 || loc.Lng > 180 || loc.Lat < -90 || loc.Lat > 90 {
		return respond(http.StatusBadRequest, errorBody("location must have a valid lng and lat"))
	}

	f := Farmer{ID: rand.Text(), Name: name, Location: loc, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	item, err := attributevalue.MarshalMap(farmerItem{PK: "FARMER#" + f.ID, SK: "PROFILE", Farmer: f})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, f)
}

func listFarmers(ctx context.Context) (events.APIGatewayV2HTTPResponse, error) {
	farmers := []Farmer{}
	pages := dynamodb.NewScanPaginator(db, &dynamodb.ScanInput{
		TableName:        aws.String(table),
		FilterExpression: aws.String("SK = :profile"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":profile": &types.AttributeValueMemberS{Value: "PROFILE"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		var batch []Farmer
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		farmers = append(farmers, batch...)
	}

	sort.Slice(farmers, func(i, j int) bool {
		if farmers[i].CreatedAt != farmers[j].CreatedAt {
			return farmers[i].CreatedAt < farmers[j].CreatedAt
		}
		return farmers[i].Name < farmers[j].Name
	})
	return respond(http.StatusOK, farmers)
}

func respond(status int, body any) (events.APIGatewayV2HTTPResponse, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return events.APIGatewayV2HTTPResponse{
		StatusCode: status,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       string(b),
	}, nil
}

func errorBody(msg string) map[string]string {
	return map[string]string{"error": msg}
}
