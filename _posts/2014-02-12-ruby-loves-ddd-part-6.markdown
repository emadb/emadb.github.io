---
layout: post
title: "Ruby Loves DDD (Part 6)"
date: 2014-02-12
comments: true
categories: 
---
We are almost at the end of our tour. In the last post we analysed what happens when a command is executed, we learnt that the events are collected in a collection of "uncommitted_events" inside the aggregate.
Now we will give a look at what happen when these uncommitted events will be...committed.
Let’s once more the code inside the handler:

    def execute(add_to_basket_command)
      basket = @repository.get_basket(add_to_basket_command.basket_id)
      article = @repository.get_article(add_to_basket_command.article_id)
      basket.add_item (article)
      basket.commit    
    end

The interesting part for today is the call to commit. Inside that method, implemented in the AggregateRootHelper, there is this piece of code:

    def commit
      while event = uncommited_events.shift
        send_event event
        store_event event
      end
    end
 

The code is very simple, it enumerates all the events and send them to the eventually subscribed objects (we will came back on this) and store the event in the database (or whatever will be).
Since everything is already done, the task of commit is to store the events in the appropriate storage. The storage is an append-only list of events that are marked with the aggregate id and it’s the same list that we used to reload the aggregate [http://ema.codiceplastico.com/2013/12/26/ruby-loves-ddd-part-4.html](http://ema.codiceplastico.com/2013/12/26/ruby-loves-ddd-part-4.html)