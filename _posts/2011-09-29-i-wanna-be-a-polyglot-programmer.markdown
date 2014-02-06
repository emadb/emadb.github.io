---
comments: true
date: 2011-09-29 00:28:48
layout: post
slug: i-wanna-be-a-polyglot-programmer
title: I wanna be a polyglot programmer
wordpress_id: 125
categories:
- .NET, C#
tags:
- c#
- dotNet
- Nodejs
- OpenSource
---

In questi giorni mi sto chiedendo quanto senso ha oggi scrivere un'applicazione (di medie/grosse dimensioni) in un solo linguaggio/framework.
Già nell'attuale versione del .NET Framework esistono 2 linguaggi che hanno scopi e usi differenti (C# e F#) e con l'arrivo di Windows8 si aggiungeranno anche Javascript e (pare) ci sarà il ritorno di C++, entrambi con scopi e utilizzi molto differenti.
Fuori dal mondo Microsoft, invece, si ha solo l'imbarazzo della scelta: RubyOnRails/Sinatra e decine di altri framework basati su ruby, PHP/Simphony/wordpress/ecc..., Python/Django, Node.js, Mongodb/Redis/Hadhoop/Couchdb... e chissa quanti altri ancora sono a disposizione di noi sviluppatori.

La particolarità è che quasi tutti questi strumenti e linguaggi non risolvono tutti i problemi, ma sono perfetti per affrontare in modo elegante e semplice un particolare problema, superando di gran lunga in termini di efficacia e performance linguaggi "general purpose" come C# o Java.

Quindi perchè non usarli?

Il primo problema, che vedo principalmente nelle aziende in cui faccio consulenza, è che si tende a specializzare i programmatori su un solo linguaggio/framework ritenendo di risparmiare  e facendo si che ogni problema debba essere risolto sempre con il Framework scelto creando a volte soluzioni complicatissime e mal funzionanti.

Il secondo problema è la pigrizia, io per primo pochi mesi fa, mi sono trovato a sviluppare un modulo in C#+SQL per fare delle cose che con Node.js+Redis avrei fatto in modo più semplice senza forzare il linguaggio e il framework in un contesto non completamente adatto al loro uso. Imparare un nuovo linguaggio costa, ma forse, sul lungo periodo, usare uno strumento non adatto costa di più ...tant'è che ora, quel modulo, stiamo valutando di riscriverlo.

Il terzo problema è l'instabilità di alcuni di questi strumenti. Node.js sta per arrivare alla versione 0.5 è ancora molto giovane e di versione in versione i breaking changes sono numerosi costringendo chi lo utilizza ad un massivo refactoring per stare al passo con le novità. Poi, molti plugin, non vengono sempre aggiornati e quindi anche in questo caso vanno aperti e modificati (e se possibile pushati su github per renderli disponibili a tutti). Non è cosi per tutti, nel mondo Ruby si è raggiunta una certa maturità che garantisce una certa continuità e comunque il mondo open source è così, con i suoi lati positivi e negativi.

Ultimo problema la piattaforma. La maggior parte degli strumenti elencati sopra non va molto d'accordo con Windows e preferisce girare su un sistema unix/linux. Questo non lo vedo come un problema, linux si può avere gratuitamente e una macchina virtuale la si prepara in poco più di 10 minuti.

Detto ciò, soprattutto come consulente, mi sento in dovere di proporre al cliente la soluzione migliore che spesso non è solo .NET ma .NET affiancato ad altri framework che lo supportano dove (almeno per il momento) ci sono ancora delle lacune.

Perciò uno dei propositi per i prossimi mesi è alzarsi dal comodo divano di .NET e iniziare a guardarsi un po' in giro per imparare ad utilizzare altri strumenti e linguaggi migliorando il modo in cui vengono realizzate le applicazioni e soprattutto dando più vantaggio ai nostri clienti.
