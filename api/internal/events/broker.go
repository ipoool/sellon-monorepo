// Package events is a tiny in-process pub/sub used to fan out
// order-created events from the storefront handler to SSE subscribers
// in the dashboard. Keyed by store_id so each seller only sees their own
// shop's events.
//
// In a multi-instance deployment this would need to be replaced with
// Redis pub/sub or a real message bus — for MVP single-process is fine.
package events

import (
	"sync"

	"github.com/google/uuid"
)

type Event struct {
	Type    string         // e.g. "order.created"
	Payload map[string]any // serialized as JSON in the SSE handler
}

type Broker struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan Event]struct{}
}

func NewBroker() *Broker {
	return &Broker{subs: make(map[uuid.UUID]map[chan Event]struct{})}
}

// Subscribe returns a buffered channel that receives events for the given
// store. Caller must drain & call Unsubscribe when done.
func (b *Broker) Subscribe(storeID uuid.UUID) chan Event {
	ch := make(chan Event, 16)
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.subs[storeID] == nil {
		b.subs[storeID] = make(map[chan Event]struct{})
	}
	b.subs[storeID][ch] = struct{}{}
	return ch
}

func (b *Broker) Unsubscribe(storeID uuid.UUID, ch chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if subs, ok := b.subs[storeID]; ok {
		delete(subs, ch)
		if len(subs) == 0 {
			delete(b.subs, storeID)
		}
	}
	close(ch)
}

// Publish fans out an event to every active subscriber for the store.
// Non-blocking: drops the event for any slow subscriber rather than
// stalling the publisher (the dashboard will pick the order up on next
// /api/v1/orders refresh anyway).
func (b *Broker) Publish(storeID uuid.UUID, ev Event) {
	b.mu.RLock()
	subs := b.subs[storeID]
	listeners := make([]chan Event, 0, len(subs))
	for ch := range subs {
		listeners = append(listeners, ch)
	}
	b.mu.RUnlock()

	for _, ch := range listeners {
		select {
		case ch <- ev:
		default:
			// Subscriber's buffer full — skip; SSE keepalive + page refresh
			// covers the missed event.
		}
	}
}
