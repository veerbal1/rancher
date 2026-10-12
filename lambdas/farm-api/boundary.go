package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func saveBoundary(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Boundary Polygon `json:"boundary"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if msg := validatePolygon(in.Boundary); msg != "" {
		return respond(http.StatusBadRequest, errorBody(msg))
	}

	boundary, err := attributevalue.Marshal(in.Boundary)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PROFILE"},
		},
		UpdateExpression:          aws.String("SET boundary = :b"),
		ConditionExpression:       aws.String("attribute_exists(PK)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":b": boundary},
		ReturnValues:              types.ReturnValueAllNew,
	})
	var notFound *types.ConditionalCheckFailedException
	if errors.As(err, &notFound) {
		return respond(http.StatusNotFound, errorBody("farmer not found"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	var farmer Farmer
	if err := attributevalue.UnmarshalMap(out.Attributes, &farmer); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, farmer)
}
