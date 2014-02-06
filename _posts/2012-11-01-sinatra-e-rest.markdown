---
comments: true
date: 2012-11-01 14:54:48
layout: post
slug: sinatra-e-rest
title: Sinatra e REST
wordpress_id: 457
---

Qualche settimana fa ho avuto il piacere di fare lo speaker alla prima european [WebNet conference](http://webnetconf.eu) con un talk su [sinatra](http://www.sinatrarb.com/).

Durante il talk ho mostrato oltre all'utilizzo normale del miniframework alcuni internals che ho scoperto navigando nel codice sorgente e giocando con la console.

La cosa più interessante è che questo codice funziona:


    require 'sinatra'

    get '/' do
    'hello world'
    end


questa è la minima applicazione sinatra, il codice è davvero tutto li, non serve altro. Come può funzionare?

Cerchiamo di capire.

get è un metodo messo a disposizione da sinatra, e viene invocato passando la rotta (in questo caso la root) e il blocco di codice da eseguire (in questo caso ritorna la stringa hello world). Attenzione che qui non sto dichiarando il metodo get, lo sto invocando (non c'è def), quindi sto in qualche modo dicendo a sinatra che a fronte di una chiamata al metodo get sulla root deve tornare una stringa.

Fin qui tutto abbastanza semplice.

Ma da dove arriva il metodo get visto che viene chiamato nel main in cui lo scope dovrebbe (ed in effetti è) sull'oggetto Object?

Modifico il codice sopra per avere qualche informazione in più


    require 'sinatra'

    outsite_self = self
    get '/' do
      inside_self = self
      "outside self is: #{outsite_self} while inside self is: #{inside_self}"
    end


Cosa ottengo a fronte di una chiamata get?

"outside self is: main while inside self is: #<Sinatra::Application>"

Quindi self (il this di C#) cambia fuori e denro la chiamata al metodo get. Questo avviene perché i blocchi fanno da "scope gate".

Ok, ma se fuori dalla get self è Object, vuol dire che Object ha il metodo get, cosa che non risulta consulntando la documentazione.

Armati della fida console possiamo cercare di capire cosa succede.

Apriamo l'interprete ruby e scriviamo un po' di codice:


    > require 'sinatra'
    true
    > method(:get)
    Method: <Object(Sinatra::Delegator)#get>
    > Sinatra::Delegator.methods(false)
    [:delegate, :target, :target=]
    > Sinatra::Delegator.target
    Sinatra::Application
    > Sinatra::Application.method(:get)
    Method: <Sinatra::Application(Sinatra::Base)#get>


Da qui si capisce che il metodo get è definito 2 volte, una volta nella classe Base di Sinatra, una seconda implementazione è presente sulla classe Delegator che viene usata da Sinatra per fare mixin con la classe Object. L'implementazione di get in Delegator non fa altro che chiamare il get della classe Base.

Quindi Object si trova disponibile il metodo get che arriva da Delegator tramite mixin. Magico!
