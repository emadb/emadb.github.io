---
layout: post
title: "Usare dropbox da un'applicazione rails"
date: 2013-03-22 09:57
comments: true
categories: [rails]
---
Utlimamente mi è capitato di dover integrare un'applicazione rails con [dropbox](http://www.dropbox.com), in particolare l'applicazione genera un PDF che deve essere salvato su dropbox.
Ho deciso di utilizzare la gemma [dropbox-api](http://github.com/RISCfuture/dropbox) invece di quella ufficiale perchè leggendo alcuni articoli in rete mi è sembrata meno a basso livello e più facilmente utilizzabile.

La prima cosa da fare è andare sul sito [www.dropbox.com/developers](https://www.dropbox.com/developers) e creare una nuova applicazione ottenendo le chiavi necessarie per configurare l'accesso.
Dopo aver aggiunto la gemma al gemfile rails e dopo averla installata tramite bundler ci si trova un task rake per ottenere le key di accesso all'applicazione:


    rake dropbox:authorize


Questo task non fa altro che recuperare i token oauth (sarete voi ad autorizzare manualmente l'applicazione usando il browser....il task vi guiderà).
A questo punto avete in mano 4 token: una APP_KEY e una APP_SECRET visibili nell'area developer di dropbox e un TOKEN con il relativo SECRET che permetteranno alla vostra applicazione rails di collegarsi a dropbox.
Questi token sono da conservare con cura e soprattutto non vanno resi pubblici (occhio ai push su github ;-)).
In genere in questi casi preferisco utilizzare quattro variabili d'ambiente che mettono a disposizione dell'app rails i valori necessari all'autenticazione, cosa che funziona anche con [heroku](http://www.heroku.com):


    #!/bin/bash
    export DROPBOX_APP_KEY='###############'
    export DROPBOX_APP_SECRET='###############'
    export DROPBOX_TOKEN='###############'
    export DROPBOX_SECRET='###############'


L'ultimo step di configurazione consiste nell'assegnare APP_KEY e APP_SECRET alle classi della gemma dropbox-api per potersi autenticare. Io mi sono creato nella cartella initializers di rails un file dropbox.rb nel quale vado ad assegnare i token:

    Dropbox::API::Config.app_key = ENV["DROPBOX_APP_KEY"]
    Dropbox::API::Config.app_secret = ENV["DROPBOX_APP_SECRET"]
    Dropbox::API::Config.mode = 'dropbox'

Il mode è la modalità di accesso a dropbox, può essere 'dropbox' per accedere a tutti i file presenti oppure sandbox per accedere solo ad una sottocartella dedicata all'applicazione.

Finita la configurazione si può iniziare ad usare le API. Per accedere a dropbox dobbiamo ottenere un'istanza della classe Client:


    client = Dropbox::API::Client.new(
        :token  => ENV['DROPBOX_TOKEN'], 
        :secret => ENV['DROPBOX_SECRET'])


ottenuta l'istanza del client si può effettuare l'updload tramite l'apposito metodo:

    client.upload 'file_di_prova.pdf', File.read(file)


Insomma il processo di configurazione è un po' lungo ma l'utilizzo è poi molto semplice.