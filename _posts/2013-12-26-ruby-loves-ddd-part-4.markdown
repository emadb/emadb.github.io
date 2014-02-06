---
layout: post
title: "Ruby Loves DDD (Part 4)"
date: 2013-12-26 15:30
comments: true
categories: 
---
In the last [post](http://ema.codiceplastico.com/blog/2013/10/25/ruby-loves-ddd-part-3/) we saw how it is implemented a command handler and how it interacts with the aggregate.

The first task that we did was to get the aggregate from the event store.
Remember that in an EventSource architecture that status of the objects (the aggregates) must be rebuilt executing every event that the object had received from its beginning. This means that the repository load a series of events (given the aggreate id) an apply all the events to the aggregate root to obtain the current state:

```ruby
# somewhere we load the evetns from the store and we get something like this
  basket_events = [
    {:aggregate_id => 1, :name => :item_added, :args => 2  },
    {:aggregate_id => 1, :name => :item_added, :args => 3  },
    {:aggregate_id => 1, :name => :item_removed, :args => 2  },
    {:aggregate_id => 1, :name => :item_added, :args => 4  },
  ]

def get_basket (basket_id)     
    basket = Basket.new
    basket.apply_events basket_events
    basket
end

So, given a list of events (basket_events) the repository simply create a new instance of the Basket aggregate and apply on it all the events using the apply_events method.
What we obtain is a basket with 2 items (ids are 3 and 4) that is the current state of the basket.
