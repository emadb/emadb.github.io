---
comments: true
date: 2011-06-01 09:08:05
layout: post
slug: ruby-visto-da-un-programmatore-c-pillole-3
title: Ruby visto da un programmatore C# (pillole) [3]
wordpress_id: 32
categories:
- Ruby &amp; RubyOnRails
tags:
- c#
- Ruby &amp; RubyOnRails
---

Come già detto più volte Ruby è un linguaggio interpretato e ogni riga di codice scritta viene di fatto eseguita dal runtime. Questo vale anche per le definizioni delle classi che possono quindi sfruttare questo aspetto per migliorare la leggibilità rimanendo comunque sintetiche.




Un esempio lampante è la definizione degli attributi di una classe. Ruby non ha il concetto di Proprietà come C# ma permette di definire un metodo get e un metodo set per impostare il valore di una variabile d'istanza. Questo può essere fatto tramite la chiamata ad un metodo:



    
    class Person
      attr_accessor :name
    end




attr_accessor è un metodo che riceve in ingresso i nomi (sotto forma di simboli) degli attributi da definire. Quando il runtime esegue quella riga di codice attr_accessor tramite metaprogrammazione va ad aggiungere alla classe il seguente codice:






    
    def name
      @name
    end
    def name=(val)
      @name = val
    end





Il risultato è un simile a quello che si ottiene con le autoproperty di C# 3 con la differenza che in C# è il compilatore che genera gli accessor a compile time, in ruby invece vengono generati a runtime quando viene eseguito il codice.

Altra cosa interessante, sul quale torneremo è la definizione estesa dell'attributo "set" fatta tramite l'implementazione del metodo "="...in ruby non esistono "cose speciali" e "=" , "+", ecc...possono essere usati come nome di un metodo :-)


