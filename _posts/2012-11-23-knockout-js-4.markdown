---
comments: true
date: 2012-11-23 17:08:15
layout: post
slug: knockout-js-4
title: Knockout.js (4)
wordpress_id: 473
---

Talvolta è necessario intercettare le operazioni di set fatte da una proprietà in binding per notificare altri viewmodel del cambiamento. Il parallelo con WPF è quando a fronte di un set di un attributo del viewmodel voglio avvisare un altro viewmodel del cambiamento usando un MessageBroker in memoria.

La stessa cosa può essere fatta con knockout.js sfruttando un estensione degli attributi observable che ci permettono di intercettare i cambiamenti:

    function ProductViewModel(desc, qta) {
      this.description = ko.observable(desc);

      this.description.subscribe(function(newDescription){
        console.log('the description has changed and the new value is': + newDescription);
        // do whatever you want
      });
    }

Il metodo subscribe messo a disposizione da knockout sugli attributi observable prende come parametro una funzione che viene eseguita ogni volta che si verifica un cambio di valore della proprietà description.
Come possiamo avvisare altri viewmodel senza creare accoppiamenti proprio come facciamo con WPF? Nello stesso modo, usando un message broker e lo vedremo nel prossimo post.
