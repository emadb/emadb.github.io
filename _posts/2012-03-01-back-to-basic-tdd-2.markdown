---
comments: true
date: 2012-03-01 14:40:52
layout: post
slug: back-to-basic-tdd-2
title: 'Back to basic: TDD (2)'
wordpress_id: 301
categories:
- Design &amp; Metodologie
---

Andiamo ancora piano piano...nel post introduttivo avevo evidenziato alcuni benefici del TDD mettendo in risalto il fatto che ti obbliga a pensare e ad essere sicuro di aver capito cosa vuole il committente. Di solito alla fine di ogni test mi chiedo se la funzionalità è davvero completa e se ci sono casi limite che vanno gestiti e in tal caso aggiungo altri test per capire come comportarmi in questi casi.

Tornando al codice della puntata precedente, quello che mi viene da chiedere al product owner è : cosa succede se aggiungo lo stesso item più volte? Naturalmente se il problema è emerso in fase di analisi so già come procedere altrimenti mi fermo e chiedo delucidazioni.

_nda: ho visto che i vari siti di ecommerce si comportano in modo diverso, per alcuni il numero di item nel carrello è il numero di prodotti univoci per altri è il numero di articoli presenti._



Per il nostro esempio il product owner ci dice che aggiungere 2 volte lo stesso articolo non fa aumentare il numero degli item, ma la quantità dello stesso (gestiremo la quantità successivamente).

Quindi il nostro test sarà:

    [Fact]
    public void AddSameItemTwice_TheItemCountShouldBe1()
    {
      var cart = new ShoppingCart();
      cart.AddItem(99);
      cart.AddItem(99);
      Assert.Equal(1, cart.ItemCount);
    }
che compila ma al momento è rosso, visto che non vengono fatti controlli sull'item aggiunto.

Per farlo diventare verde modifico il metodo AddItem di ShoppingCart


    public void AddItem(int itemId)
    {
      if (!_items.Contains(itemId))
        _items.Add(itemId);
    }


e, come al solito, valuto possibili refactoring. Quell'if appena introdotto non mi piace ma per ora lo lascio vedremo con le prossime funzionalità se si potrà rimuovere.

Quindi in questo caso non sono state aggiunte nuove funzionalità, abbiamo solo verificato che quello che avevamo scritto nella puntata precedente rispondesse in tutto e per tutto al requisito gestendo un caso non emerso subito in analisi. Quindi vuol dire che in TDD si alternano fasi di TDD vero (ossia fasi in cui si aggiungono funzionalità tramite un test) a fasi di assestamento in cui si vanno a scrivere Unit Test per verificare che in ogni caso previsto le cose funzionino.

Come al solito trovate il codice su [github](https://github.com/emadb/TddSerie/).
