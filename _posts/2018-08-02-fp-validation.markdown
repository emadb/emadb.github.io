---
comments: true
date: 2018-08-02 00:00:00
layout: post
slug: fp-validation
title: Fp-ts validation spiegata bene
---
_In CodicePlastico stiamo studiando la programmazione funzionale, abbiamo fatto [un corso](https://www.avanscoperta.it/it/training/applied-functional-programming-workshop/) con [Matteo Baglini](https://twitter.com/matteobaglini) (che consiglio a tutti) e in questi giorni stiamo provando a fare un po' di refactoring verso il paradigma funzionale.
Naturalmente i dubbi vengono, e ieri ho scritto una mail a Matteo per chiedere aiuto su una parte di codice dedicata alla validazione. La mail di risposta e' stata talmente dettagliata che ho pensato fosse uno spreco tenerla solo per me, così (con l'autorizzazione di matteo) la pubblico qui:_


> [ema]
Ciao Matteo, nell'addentrarmi nella programmazione funzionale in Typescript usando questa libreria [https://github.com/gcanti/fp-ts](https://github.com/gcanti/fp-ts) mi sono imbattuto in questo meccanismo di validazione che non capisco completamente e mi sembra molto complesso.
L'esempio particolare a cui mi riferisco e' questo: https://github.com/gcanti/fp-ts/blob/master/docs/Validation.md

---

Ciao Ema,

Personalmente direi articolato non complesso. Più avanti mi spiego.
 
> [ema] Perche’ si deve creare una funzione curried per costruire la Person?

In generale per costruire Person ti serve una funzione, questo banalmente perchè sei in fp e in fp tutto si fa con le funzioni. 
Le strutture dati algebriche (Person è un product type) non fanno niente se non immagazzinare dati.
Le funzioni permettono la costruzione e/o manipolazione di questi dati.
Ambienti come haskell e scala (con le case class) ti offrono out-of-box la funzione di costruzione.
Typescript no, prima sfiga.

> [ema] Allora perchè curried?

Questo accade perchè Applicative serva a comporre una funzione con effetti (le funzioni di validazione) + una funzione senza effetti con due parametri (la funzione di creazione di person). 
Nel mondo fp ovvero haskell una funzione con due paramentri `(a, b) => c` è di fatto (grazie a curry) 2 funzioni da 1 parametro `a => b => c`. 
Molto probabilmente Fp-Ts ha scelto di seguire più da vicino lo stile haskell, seconda sfiga.
In scala gli autori di librerie tendono ad evitare il currying perchè non è naturale nel linguaggio.

Detto questo, perchè validatePerson nell'esempio di Fp-Ts è così complessa?
Perchè ti mostra a basso livello come si compone una funzione con effetto con una funzione senza effetti con due parametri (curried).

Dissezioniamo questo mostro:
```
A.ap(validateName(input['name']).map(person), validateAge(input['age']))
```

la funzione ap è fatta così:
```
readonly ap: <A, B>(fab: HKT<F, (a: A) => B>, fa: HKT<F, A>) => HKT<F, B>
```
in scala
```
def ap: [A, B](fab: F[A => B], fa: F[A]): F[B]
```
in poche parole
  1. accetta fab: una funzione da `A=>B` wrappata in un effetto `F` aka `F[A => B]`
  2. accetta fa: un valore `A` wrappato in un effetto aka `F[A]`
  3. restutisce un `F[B]`

invocando le singole validazioni ottengo

```
const nameResult: Validation<NonEmptyArray<string>, string> = validateName(input['name'])
const ageResult: Validation<NonEmptyArray<string>, number> = validateAge(input['age'])  

A.ap(nameResult.map(person), ageResult)  
```

ora concentriamoci qui
```
nameResult.map(person) 
```
passando alla map (che accetta in ingresso una funzione con 1 parametro) il curried constructor ottengo
```
const nameResultBindend: Validation<NonEmptyArray<string>, number => Person> = nameResult.map(person)
```
dai! non ci credo! ho una funzione wrappata in un effetto sta a vedere che ora posso chiamare ap! ;-)

```
A.ap(nameResultBindend, ageResult)
```

applicando più volte la stessa tecnica (ap + map) posso comporre funzioni con 3/4/5/N parametri.
Ripeto è un dettaglio low level, importante, ma low level.

Durante il corso per non andare così low level abbiamo usato la map2/map3/etc oppure la mapN.
Prendiamo la map2, in scala la sua firma è:

```
def map2[A, B, Z](fa: F[A], fb: F[B])(f: (A, B) => Z): F[Z]
```

il suo scopo è quello di valutare in maniera indipendente 2 effetti (fa e fb), passare i risultati alla funzione f e liftare quanto prodotto (Z) nel solito effetto (F).
Questo ci permetteva di fare una roba tipo

```
case class Person(name:String, age:Int)
def makePerson(name:String, age:Int):ValidationResult[Person] = 
   Applicative[ValidationResult].map2(validateName(name), validateAge(age))(Person.apply)
```

Quindi se vuoi usare questo tipo di combinatori (a più alto livello) devi cercarli in fp-ts. 
Ho fatto un giro e controllando la definizione di Applicative (https://github.com/gcanti/fp-ts/blob/master/docs/Apply.md) non ho trovato map2 ma una cosa equivalente liftA2: Lift a function of two arguments to a function which accepts and returns values wrapped with the type constructor F

ovvero data la funzione  `f: (A, B) => Z` passandola a `liftA2` otteniamo una funzione  `g: (F[A], F[B]) => F[Z]`.

nel mondo curry andiamo da `f: A => B => Z a g: F[A] =>  F[B] => F[Z]`

in pratica prendiamo una funzione senza effetti (f) e la trasformiamo in una che funziona allo stesso modo ma effectful.

Se caliamo `liftA2` nell'esempio di validation di Fp-Ts dobbiamo prima di tutto prendere il curried constructor

```
const person = (name: string) => (age: number): Person => ({ name, age })
```

e liftarlo con `liftA2` (non conosco typescript e fp-ts quindi vado un po' di pseudo codice)

```
const A = getApplicative(getSemigroup<string>())
const personLiftata = liftA2(A)(person)
```

ed in fine validationPerson invocherà la versione liftata

```
function validatePerson(input: Record<string, string>): Validation<NonEmptyArray<string>, Person> {
  return personLiftata(validateName(input['name']), validateAge(input['age']))
}
```

sintetizzando prendiamo una funzione

```
string => number => Person
```

e "senza fare niente" la facciamo operare in un contesto di validazione

```
Validation<NonEmptyArray<string>, string> => Validation<NonEmptyArray<string>, number> => Validation<NonEmptyArray<string>, Person>
```

E qui sta la figata, ipotizziamo che validateName e validateAge siano implementate server side, quindi la validazione diventa asyn con i `Task` (sempre di Fp-Ts).
Come cambia il tutto?
La contruction function non cambia, non dipende da effetti.

Le validateName e validateAge  le riscriviamo.

```
function validateName(input: string): Task<string> ...
function validateAge(input: string): Task<number>  ...
```

La definizione della personLiftata non cambia.

Mentre validatePerson cambia solo come tipo di ritorno

```
function validatePerson(input: Record<string, string>): Task<Person> {
  return personLiftata(validateName(input['name']), validateAge(input['age']))
}
```

Il tutto accade perchè prendiamo la solita

```
string => number => Person
```

e "senza fare niente" la facciamo operare in un contesto di HTTP async

```
Task<string> => Task<number> => Task<Person>
```

Forte, no?  

> [ema] E se avesse 20 campi?

Hai un problema di design! :-)
Detto questo, esistono tante liftA con il numero di parametri

fp-ts  arriva al max a liftA4.
haskell arriva al max fino a [liftA3](http://hackage.haskell.org/package/base-4.11.1.0/docs/Control-Applicative.html#v:liftA3)
in scala arriviamo a map22 (siamo troppo avanti :-) scherzi a parte sono 22 perchè in java possiamo definire metodi fino ad un massimo di 22 parametri).

Quindi se cambiano i requisiti ed a Person viene aggiunto un campo "email" da validare dobbiamo:
1. aggiungere il campo sul product type
2. aggiungere il parametro curried alla constructor funcion
3. definire eventuali nuovi validatori
4. usare liftA3 invece di liftA2
5. usare il terzo validatore in validatePerson

Meccanico e dal punto 2 in poi guidato dal compilatore, per questo lo vedo articolato, ma non complesso.
Una volta conosciute bene le astazioni. :-)
 

Nel nostro caso le validazioni sono N e sullo stesso campo devo poter fare piu’ validazioni (ad. es. la stringa e’ una data e la data e’ maggiore di oggi). 

ti fai una funzione di validazione da stringa a data poi una da data a data in pratica ti fai le singole "check" slegati da cosa andrai a creare

```
function validateNotEmpty(input: string): Validation<NonEmptyArray<string>, string>
function validateGtToday(input: date): Validation<NonEmptyArray<string>, date>  
```

dopo la validatione della data per la solution da stringa a data è solo la composizione dei check (faccio ancora un typescript "a braccio")

```
function validateDate(input: string): Validation<NonEmptyArray<string>, date> 
              validateNotEmpty.flatMap(validateGtToday)
```

`flatMap`, aka composizione monadica, perchè prima devi poter passare da stringa a data e solo se riesci devi vedere se la data è maggiore di oggi, altrimenti non fare niente.

> [ema] E in uscita vogliamo:

```
export type SelectedSolution = {
  from: Station,
  to: Station,
  outbound: TrainDateTime,
}
export type TrainDateTime = {
  date: Date,
  time: Time
}
```

la validazione della `TrainDateTime` è una composizione applicativa di `validateDate` e `validateTime` (che non ho implemetato...)

```
function validateTrainDateTime(input: Record<string, string>): Validation<NonEmptyArray<string>, TrainDateTime> 
    createTrainDateTimeLiftata(validateDate(input['date']), validateTime(input['time']))
```

idem per Station e SelectedSolution, comporre le altre funzioni (che erano a sua volta composte da altre funzioni)

```
function validateStation(input: string): Validation<NonEmptyArray<string>, Station>
    validateNotEmpty(input).map(createStation)

function validateSelectedSolution(input: Record<string, string>): Validation<NonEmptyArray<string>, SelectedSolution>  
    createSelectedSolutionLiftata(validateStation(input['from']),  validateStation(input['to']), validateTrainDateTime(input))  
```

:-)
 
