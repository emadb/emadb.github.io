---
layout: post
title: "Ruby loves DDD (part 2)"
date: 2013-10-21 12:59
comments: true
categories: ruby
---

My experiments with Ruby and Domain Driven Implementation continues. Two weeks ago I was at the [Rupy](http://13.rupy.eu) conf talking about Domain Driven Architectures in Ruby.
The code is available on [Github](http://github.com/emadb/ruby_loves_ddd) and I would like to show you how it works with these small series of post on the topic.



To understand how it works, the best place to start is the test in the file fake_controller.rb.

```ruby
describe "I'm supposed to be a controller" do
  include CommandExecutor

  it "when an action is called I fire a command" do
    execute_command AddToBasketCommand.new(1,2)
  end
end
```

This test simulate the code inside a controller. Suppose that you have a page that permits you to add an item to the basket, the page post the information to the controller (baskedId:1 and itemId:2). The controller execute the command to add an item to the basket:

```ruby
execute_command AddToBasketCommand.new(1,2)
```
Since we must not use CRUD operation, everytime our app need to do something it issue a command that someone will manage.
AddToBasketCommand is just a struct that holds the information for the command, you can see it as the command parameters.

execute_command is defined in the module CommandExecutor that the controller should include to make use of it.

```ruby
module CommandExecutor
  def execute_command (command)
    handler = find_handler(command)
    handler.execute command
  end

  def find_handler(command)
    class_name = command.class.name.split('::').last.sub(/Command/, '') + 'Handler'
    klass = Handlers.const_get(class_name)       
    klass.new
  end
end
```

The CommandExecutor is quite simple. Given a command it finds the handler by convention (xxxCommand is managed by xxHandler). Once it found it, it calls execute on the handler to actually manage the command.

So the controller task stops here, whenever it receive a post/put it needs to create a command and issue the command to the executor. In the next post we will see how the command handler will do the job.


