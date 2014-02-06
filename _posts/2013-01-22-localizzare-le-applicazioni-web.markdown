---
comments: true
date: 2013-01-22 10:36:34
layout: post
slug: localizzare-le-applicazioni-web
title: Localizzare le applicazioni web
wordpress_id: 507
---

Sempre più spesso ci capita di realizzare applicazioni web multilingua e questo ci ha spinto a trovare una soluzione che sia facilmente riutilizzabile e che sia sostenibile facilmente.
ASP.NET MVC ha già integrato un meccanismo di localizzazione basato sulle DataAnnotation dei model, ossia possiamo attribuire ad ogni model la sua descrizione basata sulla lingua impostata.



Ad esempio:


    [Display(ResourceType=typeof(Languages.Resource),Name="name")]

Maggiori dettagli li potete trovare [qui](http://haacked.com/archive/2009/12/11/localizing-aspnetmvc-validation.aspx).

In pratica permette, tramite un file di risorse, di visualizzare l'attributo nella lingua richiesta dall'utente impostata sul thread corrente.
Personalmente non mi è mai piaciuta la soluzione proposta, che se è valida per piccole applicazioni non è applicabile ad applicazioni più complesse. Le cose che non mi piacciono sono fondamentalmente tre:
1) L'attributo funziona solo per i model e non per tutti gli altri messaggi (errori, descrizioni, testi statici, ecc…) che devono essere gestiti manualmente accedendo direttamente al file delle risorse.
2) In molti casi l'HTML deve essere "sporcato" dagli helper per poter usare il sistema di traduzione basato su risorse.
4) Non esiste un meccanismo facile per poter creare nuove lingue, visto che i file di risorse devono essere compilati. Ci piace l'idea di rendere indipendente l'utente per creare nuove lingue qualora ne avesse la necessità.

Per questi motivi ci siamo "inventati" una soluzione che sta funzionando bene. Nella pratica, l'unica cosa da fare è taggare tutte le stringhe da tradurre direttamente sulla UI (nel file cshtml/aspx) e nelle stringhe generate server side.
Taggare significa marcare in qualche modo le stringhe da tradurre, noi stiamo usando come separatore i simboli |# e #|.


La stringa "click me" sarà la chiave di ricerca in un dizionario. Le chiavi non usano una particolare sintassi sono semplicemente le etichette nella lingua di default che, tra l'altro, non deve essere tradotta (in questo caso l'engine di traduzione rimuove semplicemente i tag).

Il traduttore entra in gioco alla fine della pipeline di ASP.NET, una volta che l'HTML è stato generato, viene dato in pasto al traduttore prima di essere inviato al client, a quel punto basta prendere tutte le stringhe all'interno dei tag e tradurle usando un dizionario precaricato in memoria.

Su [github ](https://github.com/emadb/MvcMultiLanguage)ho pubblicato il codice (è una parte del nostro framework per le applicazioni web, quindi alcune cose sono un po' "custom"). Le classi importanti sono 2 un helper che data una chiave in ingresso ritorna la traduzione in una certa lingua e uno stream che riceve in ingresso l'html da tradurre. Per intercettare l'html generato da ASP.NET MVC ci siamo avvalsi di un filtro che sostituisce lo stream di default con quello che si occupa di tradurre le stringhe.

Questo sistema ha un impatto bassissimo sullo sviluppo, una volta che le stringhe sono taggate, tutto funziona out-of-the-box. Inoltre ci permette di creare un set di pagine per gestire le traduzioni che l'utente può mantenere in completa autonomia senza richiedere il nostro intervento.
Le traduzioni in genere le carichiamo in memoria alla prima richiesta, abbiamo visto che mediamente sono alcune centinaia di stringhe e per nostra esperienza è più efficiente tenerle in memoria (a livello applicativo) che ricaricarle ad ogni richiesta.
Lo storage è libero, spesso usiamo il database su cui si basa l'applicazione ma nulla vi vieta di implementare il vostro sistema di memorizzazione preferito (tra l'altro essendo un chiave-valore [Redis ](http://redis.io/)sarebbe la scelta più naturale).


Altro piccolo tip derivante dall'esperienza: la taggatura delle stringhe capita sempre di farla alla fine e qualche stringa scappa sempre. In questi casi abbiamo creato un meccanismo che inserisce nel db delle chiavi le stringhe mancanti così il database si autogenera e spetta agli utenti l'onere di mantenere le traduzioni.
