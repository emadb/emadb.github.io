---
layout: post
title: "Reactjs Redux pattern"
date: 2017-10-10
comments: true
categories:
---

# React and Redux

[ReactJs](https://reactjs.org) e’ diventato in breve tempo una delle più diffuse librerie per sviluppare applicazioni web. Ho usato il termine libreria per marcare la differenza che React ha con framework piu’ esaustivi quali ad esempio [AngularJS](https://angularjs.org).
Proprio per il fatto che ReactJs e’ una libreria, il suo scope e’ legato esclusivamente alla generazione delle View di un ipotetico framework MV*. Questo ha un duplice vantaggio: ci permettere di scegliere quale altra libreria affiancare a ReactJs per l’implementazione delle nostre applicazioni (chiamata alle api, servizi, utilities, ecc…) e lascia liberta’ di disegnare l’architettura più adatta all’applicazione che si sta sviluppando.
Quindi non siamo vincolati ad usare architetture complesse per semplici applicazioni, ma possiamo usare React e poco altro per piccole applicazioni e usare Flux e Redux per applicazioni più complesse.
[Redux](http://redux.js.org) e’ oggi lo standard di fatto anche se talvolta può essere troppo complesso, prolisso o "pesante" per applicazioni di medie dimensioni.
Redux resta comunque una ottima implementazione basata su pochi chiari principi che rendono l’applicazione semplice, testabile e manutenibile.
In questo breve articolo mi piacerebbe mostrarvi un’implementazione di redux che usiamo in CodicePlastico che e’ completamente aderente ai principi di Redux ma che rimane più semplice e meno prolissa.

### I principi di redux sono:
- Esiste un unico stato: i componenti di react non usano `this.state` ma lo stato viene memorizzato esternamente al componente e gli viene passato dall’esterno sotto forma di proprietà.
- Lo stato e’ read-only: l’unico modo di cambiare lo stato e’ quello di inviare un’azione e far si che chi riceva l’azione crei il nuovo stato 
- La trasformazione dello stato e’ fatto da funzioni pure

Come potete vedere i principi sono molto semplici e Redux di fatto non fa altro che fornire alcuni moduli che semplificano la loro applicazione.

### Un po’ di codice
Partiamo da un esempio implementato con l’uso dello stato internamente al componente per poi rifattorizzarlo verso un’architettura in puro stile redux.
Il componente e’ questo:
```javascript
class MyCounter extends React.Component {
  constructor() {
	  super()
    this.state = { counter: 0 }
  }
  plusOne() {
    this.setState({counter: this.state.counter + 1})         
  }
  render() {
    return (
     <div>
      <div>Click count: {this.state.counter}</div>
      <button onClick={this.plusOne.bind(this)}>Add 1</button>
    </div>)
  }
}
```

Questo componente mostra un bottone che se cliccato incrementa il valore del contatore visualizzato sopra il bottone stesso.
L’implementazione e’ quella classica con l’uso dello stato per memorizzare il valore del contatore.
Pur non essendoci nulla di male in questa implementazione (specialmente per il caso in questione) in casi più complessi la gestione dello stato non si limita ad una sola chiamata a `setState` ma a diverse chiamate in tempi diversi e con logiche (e molti `if`).

Il primo principio di redux sottintende che lo stato sia tenuto fuori dal componente e che venga passato al componente `MyCounter` attraverso l’uso delle `props`. Possiamo quindi introdurre un componente esterno che "wrappa" il nostro counter:
```javascript
class WithState extends React.Component { 
  constructor() {
	  super()
    this.state = { counter: 0 }
  }
  plusOne() {
    this.setState({counter: this.state.counter + 1})         
  }
  render() {
    return (
      <MyCounter value={this.state.counter} onPlusOne={this.plusOne.bind(this)} />
     )
  }
}

class MyCounter extends React.Component {
  render() {
    return (
     <div>
      <div>Click count: {this.props.value}</div>
      <button onClick={this.props.onPlusOne}>Add 1</button>
    </div>)
  }
}
```

In questo modo il componente MyCounter non fa più uso dello stato e potrebbe essere scritto sotto forma di funzione semplificando ulteriormente la sua implementazione: 
```javascript
function MyCounter({value, onPlusOne}) {
   return (
     <div>
      <div>Click count: {value}</div>
      <button onClick={onPlusOne}>Add 1</button>
    </div>)
}
```

Ma abbiamo un problema. Il componente `WithState` non e’ riutilizzabile per altri componenti avendo al suo interno conoscenza di alcune cose:
- Il componente che sta "wrappando"
- La forma dello stato
- La funzione che modifica lo stato (`plusOne`)

Vediamo come risolvere questi tre problemi. 
Partiamo dal terzo punto: dobbiamo rimuovere la logica di modifica dello stato dal componente `WithState`
Nei principi di redux si dice che per modificare lo stato bisogna scatenare un’azione che verra’ gestita da funzioni chiamate **reducer**.
L’idea di inviare azioni proviene dall’architettura unidirezionale di Flux che ha gettato le basi anche per redux.
L’idea e’ quella di introdurre un `dispatcher` che si occupa di inoltrare le richieste di azioni a tutti coloro che sono interessati.
Una semplicissima (e semplificata) implementazione di un dispatcher può essere questa:
```javascript
const dispatcher = {
  subscribers: [],
  register(subscriber) {
    this.subscribers.push(subscriber)
  },
  dispatch(action) {
    this.subscribers.forEach(s => s(action))
  }
}
```

Il suo ruolo e’ quello di ricevere una richiesta di `dispatch` da parte di un componente e inoltrare la richiesta a tutte le funzioni interessate all’azione. Il reducer prenderà’ l’azione (e lo stato corrente) e ritornerà il nuovo stato. 
Una prima idea potrebbe essere quella di lasciare al componente `WithState` l’applicazione del reducer:
	
```javascript
function counterReducer(state, action) {
  return {counter: state.counter + action.value}  
}

class WithState extends React.Component { 
  constructor() {
	  super()
    this.state = { counter: 0 }
  }
  componentWillMount() {
    dispatcher.register(action => {
      const nextState = counterReducer(this.state, action)
      this.setState(nextState)
    })
  }
  render() {
    return (
      <MyCounter value={this.state.counter}  />
     )
  }
}

function MyCounter({value, onPlusOne}) {
   return (
     <div>
      <div>Click count: {value}</div>
      <button onClick={() => dispatcher.dispatch({value: 1})}>Add 1</button>
    </div>)
}
```

In questo modo abbiamo portato all’esterno la logica di modifica dello stato.
Ora non ci resta che generalizzare portando fuori la definizione dello stato iniziale, il componente wrappato e il riferimento alla funzione reducer (che ora e’ cablata in `WithState`).
Per estrapolare quelle informazioni  possiamo scrivere una funzione che prende i 3 parametri (nome del componente, stato iniziale, la funzione che modifica lo stato) e ritorna il nuovo componente `WithState` opportunamente configurato.
```javascript
function counterReducer(state, action) {
  return {counter: state.counter + action.value}
}

function createWithState(WrappedComponent, reducer, INITIAL_STATE) {
  return class WithState extends React.Component { 
    constructor() {
	    super()
      this.state = INITIAL_STATE
    }
    componentWillMount() {
      dispatcher.register(action => {
        const nextState = reducer(this.state, action)
        this.setState(nextState)
      })
    }
    render() {
      return (
        <WrappedComponent {...this.state}  />
      )
    }
  }
}

function MyCounter({counter}) {
   return (
     <div>
      <div>Click count: {counter}</div>
      <button onClick={() => dispatcher.dispatch({value: 1})}>Add 1</button>
    </div>)
}
     
const MyComponent = createWithState(MyCounter, counterReducer, {counter: 0})
```

Con questo ultimo giro di refactoring il componente `WithState` e’ completamente all’oscuro del componente `MyCounter` ed e’ in grado di fare da wrapper a qualsiasi altro componente.
Ciao’ che varia e’ il componente wrappato, il reducer che si occupa di creare il nuovo stato, e la forma dello stato. Questi sono i tre parametri della funzione `createWithState`.

Questa implementazione e’ molto semplificata ma con un pizzico di sofisticazione in più si riesce a scrivere un modulo pronto ad essere utilizzato in produzione e a supportare la casistica di applicazioni molto complesse. La nostra implementazione la trovate qui: [t-redux](https://github.com/emadb/t-redux) e se date un’occhiata al codice ritroverete tutti i concetti spiegati in questo articolo.

Redux e’ leggermente più complesso ha il concetto di store, di selectors e poco altro ma la sua implementazione, almeno nei concetti e principi e molto simile a quanto presentato in questo post.
Una cosa che mi piace sempre ricordare e’ che e’ molto piu’ importante imparare i principi e i pattern utilizzati invece che imparare ad usare una libreria, questo perché i principi restano e le librerie passano (soprattutto nel mondo javascript).
Ad esempio Redux implementa molti principi utilizzati in architetture basate su eventsourcing, CQRS e programmazione funzionale,  inventate anni fa….come al solito non si inventa quasi mai nulla, si adattano e riusano vecchi concetti.

