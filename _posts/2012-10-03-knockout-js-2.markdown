---
comments: true
date: 2012-10-03 15:14:29
layout: post
slug: knockout-js-2
title: knockout.js (2)
wordpress_id: 414
---

Nel post precedente abbiamo visto le analogie tra knockout.js e le applicazioni WPF/Silverlight. Oggi vorrei aggiungere alcune funzionalità.

Il binding con proprietà scalari è semplice, ma come ci si comporta con le liste?
Knockout mette a disposizione il concetto di observableArray che, come la cara vecchia ObservableCollection, permette di tenere sotto controllo gli elementi presenti nella collezione ed accorgersi  dei cambiamenti.
Vediamo un esempio per capire come usarle.


Anche in questo caso se avete già lavorato con WPF/Silverlight sarete aiutati grazie alle numerose analogie.

    function ProductViewModel(desc, qta) {
      this.description = ko.observable(desc);
      this.quantity = ko.observable(qta);
    }

    function ListViewModel(items) {
      var self = this;
      this.products = ko.observableArray(items);

      this.newDescription = ko.observable();
      this.newQuantity = ko.observable();
      this.add = function(){
        var newP = new ProductViewModel(self.newDescription(), self.newQuantity());
        self.products.push(newP);
      }
    } 

    var p1 = new ProductViewModel('desc1', 10);
    var p2 = new ProductViewModel('desc2', 20);
    var p3 = new ProductViewModel('desc3', 30);

    var vm = new ListViewModel([p1, p2, p3]);

    ko.applyBindings(vm);

Questo breve pezzo di codice crea una tabella di prodotti alla quale posso aggiungere nuovi elementi usando le 2 textbox per descrizione e quantità e il pulsante +.

Nel codice javascript vengono definiti 2 viewmodel, uno che rappresenta il singolo articolo, il secondo che rappresenta la lista. Nel ProductViewModel ci sono 2 attributi osservabili: quantità e descrizione.

Il ListViewModel invece espone un attributo products che è di tipo observableArray, una funzione definita da knockoutjs per le collezioni di oggetti.

Oltre a questo attributo espone anche due attributi observable per poter leggere il valore della descrizione e della quantità inserita nei due input text html.

Questi ultimi 2 attributi sono utilizzati nella funzione add, che viene chiamata al click sul pulsante, in cui non si fa altro che creare un nuovo ProductViewModel, valorizzarlo con i valori presenti nei 2 input e aggiungerlo alla collezione osservabile. 
Le cosa da notare sono 2.
La prima è che dal javascript non devo fare nessuna ricerca nel dom per avere i valori scritti dall'utente nelle textbox, essendo bindate a proprietà osservabili le trovo direttamente negli attributi del viewmodel.
La seconda, che può far perdere una notte di sonno, è che gli attributi newDescription e newQuantity vengono chiamati con le parantesi. Questo perchè ko.observable() è una funzione e chiamarla con le parentesi equivale ad eseguirla e quindi farsi tornare il valore. Senza parentesi avrei un riferimento ad una funzione, ma non il suo valore.

L'ultima parte di codice serve per il wire-up di tutto, creo 3 prodotti, creo il ListViewModel è attivo il meccanismo tramite ko.applyBindings.


Per quanto riguarda l'HTML l'unica cosa da notare sono gli attributi data-bind. Siccome alla chiamata applyBindings abbiamo passato un'istanza di ListViewModel sarò lui il ViewModel di riferimento al quale i controlli potranno agganciarsi, quindi i due input sono in binding con gli attributi newDescription e newQuantity, il pulsante con il metodo add e la table con la collezione products (tramite il costrutto foreach:). Infine i TD sono bindati con i 2 attributi.

Su questa ultima parte ci torneremo per vedere un modo migliore di generare le righe della tabella usando i template.

