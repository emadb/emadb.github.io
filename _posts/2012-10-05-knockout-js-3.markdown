---
comments: true
date: 2012-10-05 09:02:20
layout: post
slug: knockout-js-3
title: knockout.js (3)
wordpress_id: 438
---

Nel precedente [articolo](http://blog.codiceplastico.com/ema/?p=414) abbiamo visto come mettere in binding una collezione di oggetti con una table, oggi riprendiamo l'esempio per aggiungere una funzionalità: vogliamo fare in modo che se la quantità di un prodotto è uguale a zero, la riga venga visualizzata in modo diverso (ad esempio mostrando un link per poterne ordinare altri).

Un modo per implementare la richiesta è quello di utilizzare i [template](http://knockoutjs.com/documentation/template-binding.html) che funzionano più o meno come di DataTemplate di WPF/Silverlight (sebbene siano meno "potenti").

In realtà se la differente visualizzazione implica solo l'applicazione di uno stile particolare o di un CSS si può usare il binding per valorizzare questi attributi, nel nostro caso però vogliamo che la struttura cambi nei due casi.

L'idea è semplice, si creano 2 template uno per gli articoli con quantità maggiore di zero e uno per quelli con quantità uguale a zero. Poi si espone una funzione sul ViewModel che ritorna il nome del template da usare valutando l'attributo quantity. Rispetto all'esempio del precedente articolo ho sostituito la Table con un Ul.

Tenete presente che i due template possono avere struttura completamente diversa, in questo caso sono entrambi degli LI perché devono essere messi all'interno di una lista (UL) ma nulla vieta che in altri contesti siano rappresentati in modo molto diverso (proprio come avviene per i DataTemplate di WPF).

Nel viewmodel vado ad aggiungere una funzione che ritorna l'id del template da usare:

    function ListViewModel(items) {
      // ...altri metodi.
      this.itemTemplate = function(product){
        return product.quantity() > 0 ? 'normal-row':'out-of-stock-row'
      };
    }

Questa funzione riceve in ingresso l'oggetto che stiamo per bindare e usando questo valore possiamo capire se la quantità presente è maggiore o uguale a zero, decidendo così quale template utilizzare.

Infine, per completare l'esempio, lego questa funzione tramite il binding sul tag UL.

Potete trovare l'esempio funzionante qui: [http://jsfiddle.net/emadb/jyFTX/](http://jsfiddle.net/emadb/jyFTX/)


