---
comments: true
date: 2012-03-12 11:57:00
layout: post
slug: back-to-basic-tdd-3
title: 'Back to basic: TDD (3)'
wordpress_id: 321
categories:
- Design &amp; Metodologie
---

Nei primi 2 step abbiamo introdotto una piccola funzionalità che permette di aggiungere un articolo al carrello. Continuiamo sullo stesso tema introducendo la seguente funzionalità:

_Quando aggiungo 2 item uguali, deve aumentare la quantità dell'item._

Nello step 2 abbiamo gestito l'aggiunta dello stesso articolo per 2 volte oggi gestiamo la quantità e questo ci porta alla creazione di una nuova classe che rappresenta l'articolo aggiunto.
Proviamo a scrivere un test per decidere l'interfaccia che vogliamo usare e come vogliamo operare:

    [Fact]
    public void AddSameItemTwice_TheItemQuantityShouldBe2()
    {
      var cart = new ShoppingCart();
      cart.AddItem(new CartItem(99));
      cart.AddItem(new CartItem(99));
      Assert.Equal(2, cart.Items[0].Quantity);
    }

Questa implementazione non mi piace molto perché ci costringe a sapere dell'esistenza della classe CartItem che al momento non serve se non per gestire la quantità. Inoltre è meglio non esporre pubblicamente la lista dei CartItem altrimenti si potrebbero aggiungere item senza passare dal metodo AddItem o si potrebbero fare operazioni non consentite.

Quindi modifico il test per nascondere l'esistenza di CartItem e per esporlo sotto forma di IEnumerable cosi che la collezione non sia modificabile ma sia in sola lettura.


    [Fact]
    public void AddSameItemTwice_TheItemQuantityShouldBe2()
    {
      var cart = new ShoppingCart();
      cart.AddItem(99);
      cart.AddItem(99);
      Assert.Equal(2, cart.Items.ElementAt(0).Quantity);
    }


In questo modo la creazione degli oggetti CartItem è demandato all'interno della classe ShoppingCart (che diventerà molto probabilmente l'aggregate root...ne parleremo più avanti).
Una possibile implementazione è la seguente:


    public class ShoppingCart
    {
      private readonly List _items;

      public ShoppingCart()
      {
        _items = new List();
      }

      public IEnumerable Items
      {
        get { return new ReadOnlyCollection(_items); }
      }

      public int ItemCount { get { return _items.Count; } }

      public void AddItem(int itemId)
      {
        CartItem item = _items.SingleOrDefault(i => i.Id == itemId);
        if (item != null) 
        {
          item.Quantity++;
        }
        else
        {
          item = new CartItem(itemId);
          item.Quantity = 1;
          _items.Add(item);
        }
      }
    }

    public class CartItem
    {
      public int Id { get; private set; }
      public int Quantity { get; set; }

      public CartItem(int id)
      {
        Id = id;
      }
    }


Con questa implementazione i test diventano tutti verdi.
Dedichiamoci al refactoring che questa volta serve.
Non mi piace inoltre il fatto di dover impostare nel metodo AddItem il valore di Quantity a 1, quindi sposto la definizione della quatità sull'oggetto CartItem. Non mi piace neppure che Quantity sia esposto in scrittura, quindi aggiungo un metodo AddOne:

    public void AddItem(int itemId)
    {
      CartItem item = _items.SingleOrDefault(i => i.Id == itemId);
      if (item != null)
      {
        item.AddOne();
      }
      else
      {
        _items.Add(new CartItem(itemId));
      }
    }

mentre la class CartItem:

    public class CartItem
    {
      public int Id { get; private set; }
      public int Quantity { get; private set; }

      public CartItem(int id)
      {
        Id = id;
        Quantity = 1;
      }

      public void AddOne()
      {
        Quantity++;
      }
    }

Così le cose sono un po' meglio anche se, si potrebbe provare ad eliminare l'if nel metodo AddItem, ma per ora ci tappiamo il naso e continuiamo, vediamo cosa succede.
