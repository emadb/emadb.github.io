---
comments: true
date: 2012-09-19 10:48:10
layout: post
slug: knockout-js
title: Knockout.js
wordpress_id: 405
---

La moda dei framework javascript è esplosa, esistono [decine di librerie MVQualcosa](http://addyosmani.com/blog/javascript-mvc-jungle/) che supportano lo sviluppo di applicazioni client side di una certa complessità. Premesso che sceglierne una è quasi impossibile ([paradox of choice](http://en.wikipedia.org/wiki/The_Paradox_of_Choice:_Why_More_Is_Less)) io, qualche tempo fa, mi sono buttato su [knockout.js](http://knockoutjs.com).

Una bella sorpresa! Se venite dal mondo WPF/Silverlight trovate in knockout molti dei concetti a cui eravate abituati e gli scogli iniziali sono facilmente superati.



Knockout implementa il pattern MVVM, in javascript. Il model è rappresentato dai dati che arrivano dal server, a differenza di Backbone però i dati ve li dovete caricare voi facendo le chiamate ajax con Jquery o meglio ancora con il nuovissimo framework [vanilla.js](http://vanilla-js.com) ;-).

Il ViewModel invece è una classe (funzione) Javascript che viene messa in binding (bidirezionale!!) con la view...ossia l'HTML. La view interagisce con il viewmodel chiamando dei comandi su di esso (funzioni).

Vediamo un esempio semplice che rende l'idea. Supponiamo di avere una banalissima form HTML che permette di sommare 2 importi:

il codice javascript che sta dietro è questo:


    var SumViewModel = function(){
      var self = this;
      this.value1 = ko.observable();
      this.value2 = ko.observable();
      this.result = ko.observable();
      this.sum = function(){
        self.result = self.value1 + self.value2;
      };
    }

    ko.applyBindings(new SumViewModel());


Cosa accade?

Nell'html sono stati aggiunti alcuni attributi custom (data-bind) che specificano il binding con il viewmodel. La sintassi specifica l'attributo HMTL da mettere in binding e la "proprietà" del viewmodel da cui prendere il valore.

Nel viewmodel vengono definite degli attributi che sono di tipo "ko.observable". Observable è una funzione di knockout che permette di "monitorare" una proprietà tenendo controllato il suo valore sia verso l'HTML che verso il viewModel.

Oltre alle proprietà sul viewModel vengono anche definite delle funzioni, in questo caso Sum che viene scatenata sul click del bottone. Questa funzione effettua il calcolo e imposta il valore di result che essendo osservabile viene visualizzata all'interno del div come testo.

Infine, per mettere in moto tutto il meccanismo, va chiamato il metodo applybindings di knockout per collegare il viewmodel con la view.

Insomma le analogie con WPF/Silverlight sono  numerose e questo per noi dev MS è un enorme vantaggio.

