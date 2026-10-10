package telemetry

import (
	"context"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const rosterRefresh = 10 * time.Second

type Roster struct {
	db       *dynamodb.Client
	table    string
	ids      map[string]map[int]string
	loadedAt map[string]time.Time
}

func NewRoster(db *dynamodb.Client, table string) *Roster {
	return &Roster{db: db, table: table, ids: map[string]map[int]string{}, loadedAt: map[string]time.Time{}}
}

func (r *Roster) Fill(ctx context.Context, events []Event) error {
	for i, e := range events {
		id, ok := r.ids[e.FarmerID][e.Number]
		if !ok && time.Since(r.loadedAt[e.FarmerID]) > rosterRefresh {
			if err := r.load(ctx, e.FarmerID); err != nil {
				return err
			}
			id = r.ids[e.FarmerID][e.Number]
		}
		events[i].CollarID = id
	}
	return nil
}

func (r *Roster) load(ctx context.Context, farmerID string) error {
	ids := map[int]string{}
	pages := dynamodb.NewQueryPaginator(r.db, &dynamodb.QueryInput{
		TableName:                aws.String(r.table),
		KeyConditionExpression:   aws.String("PK = :pk AND begins_with(SK, :collar)"),
		ProjectionExpression:     aws.String("id, #n"),
		ExpressionAttributeNames: map[string]string{"#n": "number"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":collar": &types.AttributeValueMemberS{Value: "COLLAR#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return err
		}
		for _, item := range page.Items {
			id, _ := item["id"].(*types.AttributeValueMemberS)
			num, _ := item["number"].(*types.AttributeValueMemberN)
			if id == nil || num == nil {
				continue
			}
			if n, err := strconv.Atoi(num.Value); err == nil {
				ids[n] = id.Value
			}
		}
	}
	r.ids[farmerID] = ids
	r.loadedAt[farmerID] = time.Now()
	return nil
}
