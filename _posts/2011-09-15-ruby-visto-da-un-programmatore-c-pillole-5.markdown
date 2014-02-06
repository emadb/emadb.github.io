---
comments: true
date: 2011-09-15 13:54:57
layout: post
slug: ruby-visto-da-un-programmatore-c-pillole-5
title: Ruby visto da un programmatore C# (pillole) [5]
wordpress_id: 81
categories:
- Ruby &amp; RubyOnRails
tags:
- c#
- Ruby
---

Nei giorni scorsi ho letto alcuni post e ho assistito ad alcune discussioni sul fatto che il mondo ruby sembra non essere interessato ai principi del buon design. Ne è conferma, per un neo-rubysta il fatto che presa una classe a caso (String), il numero di metodi che espone sono 95! La classe Object ne espone circa 50!

GULP!

E il principio SRP?

E' un po' che lavoro e studio Ruby e RubyOnRails e in questi mesi mi sono fatto un'idea che trova conferma nel bellissimo speech di @Nusco fatto a [BetterSoftware](http://www.bettersoftware.it/conference/talks/java-viene-da-marte-ruby-da-venere).

Il problema è che forse stiamo usando il metro sbagliato, è come se nel mondo Ruby ci fossero leggi fisiche diverse e quindi la forza di gravità non è 9.81 m/s2.

Infatti se andiamo a vedere il codice della classe Object vediamo che i metodi effettivamente implementati dalla classe sono pochissimi, gli altri arrivano dal mixin del modulo kernel.

Quindi stiamo violando il principio SRP? Dipende da dove stiamo facendo la valutazione visto che nel mondo .NET il concetto di mixin non esiste (anche se gli extension methods cercano di imitare il comportamento). Guardando il sorgente della classe il principio è rispettato in pieno.

Un altro aspetto è la filosofia che sta dietro il linguaggio Ruby e soprattutto dietro RubyOnRails. Entrambi cercano di rendere la vita facile ai propri utenti, ossia a noi dev. Questo porta ad esempio ad avere metodi "duplicati" o meglio "aliasati":  la classe Array ha sia il metodo count che il metodo lenght ma e uno è alias dell'altro e l'implementazione è unica. Vi garantisco che questa filosofia funziona davvero, una volta entrato nel mood giusto mi è capitato più volte di "inventare" il nome di un metodo per fare una certa cosa e scoprire che il metodo esiste davvero e che tutto magicamente funzionava. Senza l'intellisense!!

E' gli altri principi solid?

IOC e OCP in Ruby li hai sempre gratis. Puoi riaprire una classe per aggiungere/modificare/togliere un metodo...a runtime. Invece per quanto riguarda LSP, beh, su quello si gioca ad armi pari quindi valgono le stesse regole in C# e Ruby.

Quindi la questione è proprio che ciò che nel mondo .NET è un problema e richiede energie per essere risolto nel mondo Ruby viene naturale perchè il linguaggio lo permette senza sforzi. Non possiamo quindi giudicare i dev Ruby di non essere attenti al design, parlano un linguaggio diverso, vivono su mondi diversi, possono volare (grazie ad un forza di gravità molto bassa) e  non risolvono problemi che non hanno.




