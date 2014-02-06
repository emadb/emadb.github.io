---
comments: true
date: 2012-02-20 14:47:01
layout: post
slug: back-to-basic-tdd
title: 'Back to Basic: TDD'
wordpress_id: 229
categories:
- Design &amp; Metodologie
tags:
- TDD
---

Nonostante parlo di TDD da anni, e alcuni cominciano anche ad annoiarsi, ancora oggi mi rendo conto che è una pratica che non è molto utilizzata e apprezzata come meriterebbe, molti ne parlano, ma pochi la usano.

Sicuramente la sua difficoltà principale è nell'imparare a farlo con profitto, e in quella sensazione che all'inizio sia come programmare con il freno tirato, sai esattamente dove vuoi arrivare ma il fatto di dover scrivere i test rallenta le operazioni. Se siete in questo stato dovete fare ancora un po' di strada, quel "sapere esattamente dove arrivare" è probabilmente sbagliato e il TDD dovrebbe servire a scoprire dove realmente dovete arrivare.

In questo post voglio riassumere quello che secondo me il TDD insegna.

<!-- more -->


## Pensa poi scrivi


Pensare alla prossima mossa, pensare prima a cosa vogliamo implementare senza interessarci al come. Essere obbligati a scrivere un test prima del codice ci obbliga ad avere ben chiaro cosa dobbiamo fare, se non riusciamo a scrivere il test ci fermiamo, chiediamo chiarimenti e solo dopo torniamo al codice. Senza TDD, il fatto di non aver capito emerge dopo, magari dopo aver già scritto svariate righe di codice che dovranno essere adattate o buttate.


## Outside-in


L'altro punto molto interessante è l'approccio. Per me se prima del TDD era bottom-up è diventato outside-in, parto da una funzionalità, da come la voglio dare all'utente, dalla ui e poi entro nei layer della mia applicazione.  Questo porta ad avere API migliori, più mirate al business.


## Prima il comportamento


Facendo TDD si è obbligati ad implementare prima il comportamento delle classi e solo dopo si pensa ai dati.


## Piccoli passi


Si procede a piccoli passi, ogni test aggiunge una piccola funzionalità all'applicazione e gli altri test verificano che tutto continua a funzionare.


## Limito il contesto


Il TDD usato con i mock object mi permettere di tenere il focus sulla classe che sto testando, introducendo le dipendenze solo sotto forma di interfaccia che si andranno ad implementare in un secondo momento. Non stupisce quindi che si può implementare completamente un controller senza aver scritto una riga di codice dei servizi da cui esso dipende, di quelli abbiamo però già disegnato le interfacce.

Questi sono i principali effetti del TDD, ho tralasciato quelli più scontati e noti: meno bug, migliore design ecc...perché la mi sensazione è che dipendano da questi...il design è migliore perché mi concentro su una classe alla volta, la disegno pensando all'interfaccia e penso al comportamento.

Ma il TDD non si impara leggendo un libro o seguendo un corso (nemmeno il mio :-)), si impara facendolo. Per questo voglio provare a scrivere una serie di post sul TDD per mostrare come un'applicazione può nascere test dopo test. Mi permetto di chiamare la serie "Back to basic" rubando il titolo alla [keynote](http://www.agilemovement.it/video/back-to-basics-oop-and-design) che [Paolo Polce](https://twitter.com/paolopolce) ha tenuto all'agileday del 2011.


