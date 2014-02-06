---
layout: post
title: "ruby loves DDD (part 3)"
date: 2013-10-25 18:10
comments: true
categories: 
---

In the last [post](http://ema.codiceplastico.com/blog/2013/10/21/ruby-loves-ddd-some-code/) we saw how the controller issue a command to the pipeline, now we will see how this command in managed.

The CommandExecutor finds the handler for the given commmand. In our case the command was `AddToBasketCommand` and the relative handler is `AddToBasketHandler`.
The code is here:

```ruby
class AddToBasketHandler
  def execute(add_to_basket_command)
    basket = @repository.get_basket(add_to_basket_command.basket_id)
    basket.add_item (add_to_basket_command.article_id) 
    basket.commit
  end
  # more code here...
end
```

The aim of a handler is to find the interested aggregate and send messages to it so that it can execute the needed tasks.
In our case, we get from the repository an instance of Basket class using the id attribute of the command and we call `add_item` on that so that our operation will be done.
This calls should be made in transaction, but for the sake of simplicity I don't manage them now.
The last call is a message sent to commit method on the aggreate root. This is necessary to confirm the operation, we are saying: ok, we have done with our job. Internally the commit simply apply all the events that were generated in previous methods.
