---
comments: true
date: 2011-09-25 18:40:33
layout: post
slug: asp-net-mvc-antipattern
title: Asp.net MVC Antipattern
wordpress_id: 134
categories:
- .NET, C#
tags:
- ASPNETMVC
- Patterns
- REST
---

[ASP.NET MVC](http://www.asp.net/mvc/) è stato rilasciato alcuni anni fa e nonostante non sia ancora diffusissimo (più che altro per questioni psicologiche) sta pian piano mangiando terreno ad ASP.NET WebForm dimostrando ancora una volta che la semplicità paga.

Infatti molti dev WebForm che hanno avuto la possibilità di provare ASP.NET MVC fanno il possibile per migrare al nuovo framework ma alcuni commettono l'errore di pensare ancora in termini di pagine introducendo a mio avviso un antipattern.

ASP.NET MVC implementa il pattern MVC (ma va?) o come sottolineerebbe il caro [Andrea](http://blogs.ugidotnet.org/pape/Default.aspx) il pattern [Model2](http://en.wikipedia.org/wiki/Model2).

La grossa differenza rispetto a WebForm è che l'applicazione non espone delle pagine ma delle risorse (o entità) su cui fare le operazioni e la corrispondenza dovrebbe essere una risorsa un controller (REST vi dice qualcosa?).

Quindi mentre con ASP.NET Web Form si tendeva a creare una pagina per ogni scenario di utilizzo indipendentemente dalle risorse coinvolte con ASP.NET MVC è preferibile creare dei controller che siano più coesi con ciò che rappresentano piuttosto che controller che contengano una sbrodolata di metodi non correlati. Su questi controller vengono poi montate una serie di View che prendono ed elaborano i dati per visualizzarli.

Faccio un esempio per chiarire cosa intendo. Consideriamo il seguente controller:

    
    public class CustomerController : Controller
    {
      // ...
    
      public ActionResult GetOrders(int customerId)
      {
        // ...
      }
    }


Mi aspetto che il CustomerController effettui operazioni su un cliente ma il metodo GetOrders sta introducendo un'operazione su una nuova risorsa che dovrebbe avere il suo controller dedicato. Per questo la scelta più giusta sarebbe chiedere al controller di order di darmi l'elenco degli ordini del cliente in questione, e questa richiesta dovrebbe arrivare dal client (browser) utilizzando verosimilmente un javascript.

Può sembrare strano all'inizio perchè una parte di logica viene spostata sul browser ma non ci vedo nulla di male, ormai come detto più volte non siamo solo programmatori C# ma anche programmatori Javascript dove il browser è la nostra piattaforma di sviluppo e visto che non sono solo dei visualizzatori di HTML ma delle vere e proprie virtual machine javascript non vedo perchè non sfruttarli.

Procedendo secondo questo pattern quello che si ottiene è un server che espone delle risorse in formato Json (o XML o altr0) e un client che tramite javascript richiede a vari controller i dati che servono per comporre la pagina: un controller = una risorsa.

In questo modo risulta molto facile creare diverse tipologie di client riutilizzando al 100% il server che risulta agnostico al tipo di visualizzazione.
