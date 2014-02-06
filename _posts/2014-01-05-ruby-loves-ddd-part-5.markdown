---
layout: post
title: "Ruby Loves DDD (Part 5)"
date: 2014-01-05 23:25
comments: true
categories: 
---

Going back to the handler. We saw in a previous [post](http://ema.codiceplastico.com/blog/2013/10/25/ruby-loves-ddd-part-3/) how the repository recreates the aggregate state re-executing the events. Now that we have the aggregate reference we can call methods on it:

```ruby
class AddToBasketHandler
  def execute(add_to_basket_command)
    #repository creates the basket reloading all the events
    basket = @repository.get_basket(add_to_basket_command.basket_id)
    # now we can operate on basket
    basket.add_item (add_to_basket_command.article_id) 
    basket.commit
  end
  # more code here...
end
```

In the above example we are adding a new item to the basket using the method ```add_item```.
Now we will see how the add_item is implemented in the basket object:

```ruby
def add_item (item)
  raise_event :item_added, item
end
```

The implementation is quite curious, all that it does is raising an event calling the method ```raise_event``` passing a symbol that specify the event name and the item to add.

The ```raise_event method``` is provided by the ```AggregateRootHelper``` a module included in the Basket class:

```ruby
def raise_event(event_name, *args)
  uncommited_events << {name: event_name, args: args}
  send "on_#{event_name}", *args
end
```

It collect the event information inside an array of "uncommited events" and then dynamically call a method called ```on_item_added``` passing the event arguments.

```ruby
def on_item_added item
  get_item(item).try(:increase_quantity) || @items << BasketItem.new(item)      
end
```

The ```on_item_added``` event on basket class is where the job is really done: it increase the quantity of the item if it is already present in the basket otherwise it creates a new item.

You may ask why should be so complecated add an item the the basket?

The ```raise_event``` is necessary because the storage is event based not status based, so raising the event is important to track the fact that a new item is being added and the uncommitted_events array in the module is there to store this event (and to persist them later). The event raised could also be useful if we wan to inform other aggregates of the fact the a new item is added: for example a warehouse aggregate could receive the message to manage the available quantity.

