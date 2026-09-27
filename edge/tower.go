package main

import "fmt"

func Tower(events <-chan Event) {
	for e := range events {
		fmt.Printf("%+v\n", e)
	}
}
