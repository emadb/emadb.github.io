---
comments: true
date: 2012-02-24 14:15:53
layout: post
slug: back-to-basic-il-contesto-e-il-primo-test
title: 'Back to basic: il contesto e il primo test'
wordpress_id: 273
categories:
- Design &amp; Metodologie
---

Per partire con la serie di post sull'applicazione del TDD dobbiamo prima identificare un contesto che sia abbastanza semplice da capire ma anche abbastanza complesso da implementare.

Quello a cui ho pensato è un'applicazione di e-commerce, alla amazon (con molta fantasia) e vorrei partire proprio dalla gestione del carrello, credo sia capitato a tutti di fare almeno un acquisto online e quindi il dominio dovrebbe essere noto.

_Alcuni disclaimer: non voglio implementare un'intera applicazione di ecommerce, e, almeno per ora, non voglio tirare in ballo la UI, frameworks, persistenza ecc....quindi sebbene le storie per essere completate necessiterebbero di tutta la filiera che va dalla UI fino al database (nel caso si decidesse di usare un db) farò delle enormi semplificazioni e mi limiterò all'implementazione del domain model. Se poi ci sarà la voglia di continuare in futuro monteremo una UI adatta alle operazioni implementate._

Iniziamo piano, a piccoli passi e la prima storia che andremo ad implementare è un semplice punto di partenza, il minimo per avere un qualcosa su cui ragionare, aggiungeremo successivamente funzionalità più avanzate.

Come utente che sta navigando sul sito posso aggiungere un articolo nel carrelloPartiamo con la scrittura del primo test:

    [Fact]
    public void AddItem_TheItemIsNotYetInTheBasket_ShouldAddItToTheBasket()
    {
      var cart = new ShoppingCart();
      cart.AddItem(99);
      Assert.Equal(1, cart.ItemCount);
    }


Questo semplice test che può risultare perfino banale ma ci permette di posare la prima pietra e ci obbliga a decidere alcune cose: il nome delle classi in gioco e una prima parte di interfaccia che, in questo caso la classe ShoppingCart, dovrà esporre.

Vorrei riflettere un attimo sul metodo di verifica che abbiamo scelto di utilizzare: verificare il valore della proprietà ItemCount. ItemCount è stata introdotta solo per poter testare l'applicazione, almeno per ora non ha altri scopi, quindi non sono sicurissimo che questo vada bene.
Se ragioniamo a livello funzionale, servirà sicuramente un qualcosa che ci permetta di sapere quanti articoli sono presenti nel carrello (almeno per esporlo vicino all'icona del carrello), ma al momento non ci serve.

Un'alternativa sarebbe stata quella di usare un DomainEvent per notificare al resto del mondo il fatto che un articolo è stato inserito, il test avrebbe potuto sottoscriversi all'evento e fare li l'asserzione.
Per ora teniamo buona l'implementazione più classica, vedremo in futuro se spostarci verso una soluzione ad eventi.

Quindi adesso abbiamo un test che non compila. Primo step: facciamolo diventare rosso.

Quindi implemento la classe ShoppingCart in questo modo

    public class ShoppingCart
    {
      public int ItemCount { get { return 0; } }

      public void AddItem(int itemId)
      {
      }
    }


La fase "rossa" è molto importante perché è l'unico feedback che abbiamo sulla bontà del test, se il test è rosso e il messaggio d'errore è coerente stiamo con buona probabilità testando la cosa giusta.

Quindi è giunto il momento di farlo diventare verde:


    public class ShoppingCart
    {
      private IList _items;
      public int ItemCount { get { return _items.Count; } }

      public void AddItem(int itemId)
      {
        _items = new List();
        _items.Add(itemId);
      }
    }


Ora la barra è verde. Refactoring? Al momento non ne abbiamo bisogno, per ora può  bastare, abbiamo scritto un primo test, abbiamo una semplicissima funzionalità, poca cosa, ma comunque un punto di partenza. Le cose importanti che abbiamo fatto sono state decidere il nome della classe e definire l'interfaccia del metodo per aggiungere un articolo. Notate come per ora non abbiamo introdotto una classe Product, per ora ci limitiamo ad usare l'id di un ipotetico prodotto.

Trovate il codice sorgente del progetto su [github](https://github.com/emadb/TddSerie/)
