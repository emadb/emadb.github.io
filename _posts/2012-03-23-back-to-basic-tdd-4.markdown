---
comments: true
date: 2012-03-23 15:32:14
layout: post
slug: back-to-basic-tdd-4
title: 'Back to basic: TDD (4)'
wordpress_id: 342
categories:
- Design &amp; Metodologie
tags:
- TDD
---

Continua la serie, per piccoli passi.

La storia che implementiamo oggi è la seguente:

_Dato un carrello posso sapere il prezzo totale degli articoli presenti._

Da un po' di analisi emerge che il prezzo degli articoli è una cosa che cambia spesso anche per eventuali promozioni, saldi, ecc...quindi nasce l'esigenza di un servizio che si occupa dato un articolo di restituire il prezzo corrente (se questo non emergesse subito, no prob, si potrà fare refactoring in futuro).

Come al solito partiamo da un test per ragionare un po'. Quello che voglio è che l'oggetto CartItem utilizzi un servizio per sapere il prezzo del'articolo aggiunto, detto in C#:


    [Fact]
    public void GetTotal_OneItem_ShouldAskToPriceListServiceTheItemPrice()
    {
      var priceListService = new Mock();
      var cart = new ShoppingCart(priceListService.Object);

      cart.AddItem(99);

      priceListService.Verify(p => p.GetCurrentPriceFor(99));
    }


Questo test è diverso da quelli scritti fin'ora. Prima di tutto viene usato un mock object (priceListService) invece del vero oggetto in modo da avere uno unit test nonostante le dipendenze e poi non vengono fatte asserzioni sullo stato ma sulla collaborazione tra l'oggetto CartItem e il servizio.

Questo tipo di test si chiamano test di interazione a differenza di quelli fatti fino ad ora che erano test di stato. I test d'interazione verificano che 2 o più oggetti collaborino in modo corretto chiamando i giusti metodi con i giusti parametri. Nel nostro caso vado a verificare che il metodo GetCurrentPriceFor venga chiamato con il valore 99, se ciò avviene il test passa altrimenti fallisce. Non mi interessa lo stato dell'oggetto CartItem tant'è che non faccio alcuna asserzione su di esso.

La cosa interessante è che nel test sopra sto introducendo una nuova classe della quale vado a definire la competenza e parte dell'interfaccia ma non mi occupo dell'implementazione che demando in un secondo momento.

Il test è definito quindi posso passare alla fase rossa. Per compilare aggiunto al costruttore di ShoppingCart il parametro di tipo IPriceListService, aggiungo l'interfaccia e il test è già rosso.

Il messaggio di errore mi dice che il metodo GetCurrentPriceFor non è stato chiamato correttamente, quindi l'interazione prevista tra ShoppingCart e il servizio non è avvenuta. Per farlo diventare verde aggiungo in fondo al metodo AddItem la seguente riga di codice (_priceListService è l'istanza del servizio passata a ShoppingCart):

    _priceListService.GetCurrentPriceFor(itemId);

Il test d'interazione è verde ma la storia non è ancora completa, quello che chiedeva era di esporre il prezzo totale degli articoli del carrello, quindi devo esporre una proprietà che mostri il prezzo calcolato tramite il servizio. Aggiungo un test:


    [Fact]
    public void GetTotal_OneItem_ShouldSetTheTotalValue()
    {
      var priceListService = new Mock();
      var cart = new ShoppingCart(priceListService.Object);

      priceListService.Setup(p => p.GetCurrentPriceFor(99)).Returns(100m);
      cart.AddItem(99);

      Assert.Equal(100m, _cart.Total);
    }

Questo test sebbene simile al precedente torna a valutare lo stato dell'oggetto indipendentemente dalla collaborazione con il servizio. Ho aggiunto un test perché rispetto al precedente sto testando un'altra cosa sebbene nel contesto della stessa storia.

Da notare che in questo test l'oggetto priceListService funziona da Stub e non da Mock (non verifica la collaborazione ma risponde  con il valore 100 ad ogni chiamata del metodo).

Al momento il test è rosso, quindi modifico il metodo AddItem nel seguente modo:


    public void AddItem(int itemId)
    {
      CartItem item = _items.SingleOrDefault(i => i.Id == itemId);
      if (item != null)
        item.AddOne();
      else
        _items.Add(new CartItem(itemId));

      Total = _priceListService.GetCurrentPriceFor(itemId);
    }


Come vedete ho fatto un piccolo passo, al posto di = avrei potuto scrivere direttamente un +=. Vi invito a non fare passi troppo lunghi e a cercare di soddisfare sempre solo ciò che il test richiede.

Per arrivare all'implementazione finale e completare la storia basterà aggiungere un altro test che aggiunge 2 item e che verifica che il totale sia la somma dei prezzi. Per questo vi rimando al sorgente presente sul [repo](https://github.com/emadb/TddSerie/) per non allungare troppo questo post.
