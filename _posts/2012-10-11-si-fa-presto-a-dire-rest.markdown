---
comments: true
date: 2012-10-11 17:12:40
layout: post
slug: si-fa-presto-a-dire-rest
title: Si fa presto a dire REST
wordpress_id: 251
---

Ogni periodo storico informatico ha le sue buzzword e oggi una di quelle più usate è REST. Anni fa andava di moda SOAP, oggi tutti si scagliano contro di lui (spesso senza ragione) e portano come migliore soluzione REST. Ma REST lo fanno in pochi forse perché non esistono delle vere e proprie specifiche implementate e perché all'aderenza alla teoria si preferisce (giustamente) il pragmatismo. <!-- more -->Al di là dei dettagli implementativi una API REST deve rispettare questi principi.



	
  * Uniform Interface

	
  * Stateless

	
  * Cacheable

	
  * Client-Server

	
  * Layered System




## Uniform Interface


L'interfaccia espone delle risorse ognuna delle quali ha un preciso URL e le risorse sono svincolate dalla loro rappresentazione fisica e il server invia a chi ne fa richiesta una rappresentazione in json, xml, html, jpg della risorsa richiesta. Quando il client riceve la risorsa ha  sufficienti informazioni per manipolarla, modificarla e cancellarla.


## Stateless


Il server deve essere stateless, risponde ad una richiesta e lo stato della risorsa è contenuto nel body della risposta, cosa succede dopo il server non lo sa e non lo deve sapere. E' il client che si deve far carico di gestire lo stato ed effettuare le opportune richieste.


## Cacheable


La specifica del protocollo HTTP ha una vasta sezione dedicata al caching, quindi senza inventarsi nulla di nuovo nella risposta può essere specificato il tipo e la durata della cache per la risorsa che si sta inviando.


## Client Server


Il client e il server si parlano solo tramite la uniform interface, il client non sa nulla di come il server memorizza i dati e per contro il server non sa nulla di come il client di cosa il client fa i con i dati ricevuti e di come li modifica (fino all'eventuale richiesta successiva).


## Layered System


Un client non sa se è direttamente connesso al server o se passa attraverso strati di proxy, load balancer, ecc...il fatto che sia resource based e che non ci sia stato permette a client e server di essere completamente indipendenti e di usare l'infrastruttura necessaria a scalare quando necessario.
