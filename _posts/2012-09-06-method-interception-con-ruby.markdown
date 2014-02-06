---
comments: true
date: 2012-09-06 08:00:21
layout: post
slug: method-interception-con-ruby
title: Method interception con Ruby
wordpress_id: 399
---

Durante le vacanze estive ho letto [Metaprogramming Ruby](http://www.amazon.com/Metaprogramming-Ruby-Program-Like-Pros/dp/1934356476/ref=sr_1_1?ie=UTF8&qid=1346860185&sr=8-1&keywords=metaprogramming+ruby) di [Paolo Perrotta](https://twitter.com/nusco), libro denso a tratti difficile ma di grandissimo interesse che ti porta a scoprire la potenzialità di Ruby che, per noi programmatori "statici" abituati a quel poco di reflection che il .NET framework mette a disposizione, sembra fanta-programmazione.

Una delle cose che in .NET non è fattibile in modo semplice è l'intercettazione delle chiamate ai metodi di un'istanza. Si può fare usando [DynamicProxy](http://www.castleproject.org/projects/dynamicproxy) ma la scelta è abbastanza vincolante in quanto ci obbliga a creare tutte le classi passando da una factory ad hoc che tramite la citata libreria si occupa di istanziare i nostri oggetti rendendoli intercettabili.

In Ruby la cosa è di una semplicità e naturalezza disarmante.


Supponiamo di avere una classe fatta in questo modo:

    class MyService
      def do_something
       p "i'm doing something very interesting"
      end
    end

Fin qui nulla di particolare, una normale classe con un metodo do_something. Il bello arriva ora. In Ruby posso "riaprire" le classi per aggiungere, togliere, cambiare i metodi, inoltre posso anche creare degli alias di un metodo:

    MyService.class_eval do
      alias :do_something_new :do_something

      def do_something
        p "i'm ready to do something"
        do_something_new
        p "i did something interesting, isn't it?"
      end
    end

Questo codice riapre la class MyService, definisce un alias del metodo `do_something` e subito dopo ne fa l'override. La nuova versione del metodo do_something, fa alcune cose (pre e post esecuzione) e chiama il metodo originale tramite l'alias definito sopra.


    service = MyService.new
    service.do_something
    >> "i'm ready to do something"
    >> "i'm doing something very interesting"
    >> "i did something interesting, isn't it?"

Senza parole.

[Mi scusino i rubysti per il pathos che trapela da questo post, ma io vedendo certe cose mi emoziono.]
