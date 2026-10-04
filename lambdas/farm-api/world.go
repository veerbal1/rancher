package main

import (
	"context"
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

type WorldPaddock struct {
	ID           string  `json:"id"            dynamodbav:"id"`
	Name         string  `json:"name"          dynamodbav:"name"`
	Polygon      Polygon `json:"polygon"       dynamodbav:"polygon"`
	FenceVersion int     `json:"fence_version" dynamodbav:"fence_version"`
	Kind         string  `json:"kind"          dynamodbav:"kind"`
}

type WorldCollar struct {
	ID        string  `json:"id"         dynamodbav:"id"`
	Number    int     `json:"number"     dynamodbav:"number"`
	Name      string  `json:"name"       dynamodbav:"name"`
	PaddockID *string `json:"paddock_id" dynamodbav:"paddock_id"`
}

type WorldFarm struct {
	FarmerID  string         `json:"farmer_id"`
	Name      string         `json:"name"`
	Location  *Location      `json:"location"`
	Paddocks  []WorldPaddock `json:"paddocks"`
	Collars   []WorldCollar  `json:"collars"`
	Shifts    []Shift        `json:"shifts"`
	createdAt string
}

func getWorld(ctx context.Context) (events.APIGatewayV2HTTPResponse, error) {
	farms := map[string]*WorldFarm{}
	farm := func(pk string) *WorldFarm {
		if farms[pk] == nil {
			farms[pk] = &WorldFarm{Paddocks: []WorldPaddock{}, Collars: []WorldCollar{}, Shifts: []Shift{}}
		}
		return farms[pk]
	}

	now := time.Now().UTC().Format(time.RFC3339)
	pages := dynamodb.NewScanPaginator(db, &dynamodb.ScanInput{
		TableName:      aws.String(table),
		ConsistentRead: aws.Bool(true),
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		for _, item := range page.Items {
			pk, sk := stringAttr(item["PK"]), stringAttr(item["SK"])
			if !strings.HasPrefix(pk, "FARMER#") {
				continue
			}
			f := farm(pk)
			switch {
			case sk == "PROFILE":
				var farmer Farmer
				if err := attributevalue.UnmarshalMap(item, &farmer); err != nil {
					return events.APIGatewayV2HTTPResponse{}, err
				}
				f.FarmerID, f.Name, f.Location, f.createdAt = farmer.ID, farmer.Name, farmer.Location, farmer.CreatedAt
			case strings.HasPrefix(sk, "PADDOCK#"):
				var p WorldPaddock
				if err := attributevalue.UnmarshalMap(item, &p); err != nil {
					return events.APIGatewayV2HTTPResponse{}, err
				}
				f.Paddocks = append(f.Paddocks, p)
			case strings.HasPrefix(sk, "COLLAR#"):
				var c WorldCollar
				if err := attributevalue.UnmarshalMap(item, &c); err != nil {
					return events.APIGatewayV2HTTPResponse{}, err
				}
				f.Collars = append(f.Collars, c)
			case strings.HasPrefix(sk, "SHIFT#"):
				var s Shift
				if err := attributevalue.UnmarshalMap(item, &s); err != nil {
					return events.APIGatewayV2HTTPResponse{}, err
				}
				if s.active(now) {
					f.Shifts = append(f.Shifts, s)
				}
			}
		}
	}

	list := make([]*WorldFarm, 0, len(farms))
	for _, f := range farms {
		if f.FarmerID != "" {
			sort.Slice(f.Collars, func(i, j int) bool { return f.Collars[i].Number < f.Collars[j].Number })
			list = append(list, f)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].createdAt < list[j].createdAt })
	return respond(http.StatusOK, map[string]any{"farms": list})
}

func stringAttr(v types.AttributeValue) string {
	if s, ok := v.(*types.AttributeValueMemberS); ok {
		return s.Value
	}
	return ""
}
