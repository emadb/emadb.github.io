---
layout: post
title: "Functional programming"
date: 2013-11-12 14:53
comments: true
categories: 
---

In the last year Functional Programming is the topic that devs are talking about. Many functional languages are becoming popular ([Scala](http://www.scala-lang.org/), [F#](http://www.tryfsharp.org/), [Clojure](http://clojure.org/), [Elixir](http://elixir-lang.org/) and someone is starting to say that functional programming will be the next big thing.
As usual as a curious guy I started to study the fundamentals and theories behind functional programming and I must admit that most of the time we are using the wrong language to resolve our daily problems.

Object Oriented Languages is useful when you have a state to persist (as in a GUI application)  but in other cases you don’t need it. Consider a web app. The server side could be just a series of functions that respond to the HTTP commands that arrives from the clients.

Functional programming is about writing programs that are a built as a set of functions that calls each others. Well actually this definition doesn’t made justice, functions must be pure and data must be immutable so consider this is a rough description. :-)

The main points are that you cannot preserve the state and that the functions cannot modify arguments. This means that you can call the function whatever times you want and the function will return always the same result without affecting the state.

This also mean that the execution model is simplyfied and the computer (the compiler/runner) have just to substitute the functions with their result to execute the program. So the implementation of the compilers and interpreters is quite easier.

With object oriented programming the evaluation is much more complicated, since the executor must take care of the state to be able to execute the program.
In second instance writing imperatives programs is more difficult since often you must take care of the order of the assignments.

Consider this simple example of a program that calculates the factorial of a given number:


    defmodule ImperativeFactorial do
      def factorial(n) do
        iter(n, 1, 1)
      end

      def iter(n, counter, product) do
        if counter > n do
          product
        else
          product = counter * product
          counter = counter + 1
          iter(n, counter, product)
        end
      end
    end  

This implementation is very imperative and use two variables to store the state (product, counter) between iterations. It works but if we swap the order of the two assignment the result will be wrong:

    counter = counter + 1 
    product = counter * product

Functional programming avoid these flaws because it doesn’t store state. A possible implementation in Elixir is: 


    defmodule Factorial do
      def iter(0), do: 1
      def iter(n) when n > 0 do
        n * iter(n-1)
      end
    end

Apart the fact that is a lot simpler and short it doesn’t have the pitfall of the previous implementation.