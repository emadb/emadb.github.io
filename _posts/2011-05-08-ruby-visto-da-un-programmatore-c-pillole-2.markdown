---
comments: true
date: 2011-05-08 21:46:00
layout: post
slug: ruby-visto-da-un-programmatore-c-pillole-2
title: Ruby visto da un programmatore C# (pillole) [2]
wordpress_id: 6
categories:
- Ruby &amp; RubyOnRails
tags:
- c#
- Ruby &amp; RubyOnRails
---

Nel post precedente abbiamo visto come è possibile aggiungere un metodo ad una classe, nello stesso modo in cui abbiamo aggiunto il metodo lo possiamo anche rimuovere.




Riprendendo l'esempio precedente:



    
    class Numeric



    
      remove_method :to_money



    
    end




stiamo rimuovendo il metodo to_money .




Dopo questa rimozione se effettuiamo una chiamata al metodo come fatto la scorsa volta otteniamo:



    
    NoMethodError: undefined method ‘to_money’ for 200:Fixnum




Ossia il metodo to_money non esiste.




La stessa tecnica si può utilizzare per rimuovere qualsiasi metodo ad una classe:



    
    
    class Object
      remove_method :to_s
    end




In questo modo stiamo rimuovendo il metodo to_s (l'equivalente del ToString) a tutte le classi, visto che Object è la classe base di tutti gli oggetti ruby.




A cosa può servire rimuovere un metodo?




Secondo me può essere utile per evitare che certe operazioni su una classe vengano effettuare, in un SDK potremmo vietare certe operazioni.




Il metodo remove_method rimuove il metodo solo dalla classe corrente quindi a runtime verrà ricercato nelle super classi dell'istanza su cui viene chiamata.




Se vogliamo rimuovere il metodo da tutta la gerarchia possiamo usare il metodo undef_method che fa in modo che la classe non risponda più a quel metodo (e non effettui la ricerca nelle sue superclassi).
