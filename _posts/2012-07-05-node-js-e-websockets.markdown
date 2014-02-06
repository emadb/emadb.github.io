---
comments: true
date: 2012-07-05 13:05:31
layout: post
slug: node-js-e-websockets
title: Node.js e websockets
wordpress_id: 372
categories:
- nodejs
tags:
- Nodejs
---

Uno degli ambiti in cui [Node.js](http://nodejs.org/) si trova a suo perfetto agio è nei contesti in cui è necessaria un'alta reattività dei componenti in gioco. Il classico esempio che viene riportato nei tutorial di Node.js è l'implementazione di una chat, in cui i client non fanno polling ma vengono notificati direttamente dal server della presenza di un nuovo messaggio.



Com'è possibile ciò?

Grazie a [WebSocket](http://en.wikipedia.org/wiki/Websocket)!

Con i WebSocket è possibile stabilire un canale di comunicazione diretto tra il server e il client e viceversa andando quindi oltre il concetto di Request-Response a cui il protocollo HTTP ci ha abituato.

Per utilizzare WebSocket in un'applicazione web dobbiamo avere un browser che lo supporta e possiamo fare affidamento su Firefox, Chrome o Safari. Non su Internet Explorer che solo dalla versione 10 supporterà questa tecnologia.

Fortunatamente ci sono alcune librerie che abbinate a node.js riescono a supportare tutti i browser (anche quelli un po' datati) grazie a tecniche di fall-back. Ad esempio [Socket.io](http://socket.io/) supporta perfino Internet Explorer 5.5.

Socket.io viene distribuita in 2 parti, una parte client da referenziare dalla pagina web e un modulo per node.js per la parte server.

Questa è la parte client che gira nel browser. Il codice si spiega da solo: viene aperta una connessione socket con il server, si sottoscrive ai messaggi `server_message` e quando ne riceve uno lo appende ad una lista presente nel DOM. La seconda parte serve per inviare un messaggio al server: sul click del pulsante invia un `client_message` al server il cui contenuto è il testo presente nel controllo HTML.

Lato server la cosa è analoga:

    var io = require('socket.io').listen(80);

    io.sockets.on('connection', function (socket) {
      socket.emit('server_message', { text: 'node rulez!' });
      socket.on('client_message', function (data) {
        console.log(data.text);
      });
    });

Anche qui si aspetta una connessione . Tramite il metodo emit invia un  messaggio ai client connessi e tramite il metodo on si sottoscrive ai messaggi dei client (in questo caso stampa sulla console il contenuto).

Quindi la cosa è abbastanza semplice ma apre scenari molto interessanti per chi sviluppa applicazioni web ed è abituato al paradigma Request-Response.

Grazie ai websocket si possono realizzare applicazioni che ricevono notifiche push reali, ottimizzando le performance del server che non è costretto a rispondere ai polling degli n client. Event-based a tutti gli effetti.
