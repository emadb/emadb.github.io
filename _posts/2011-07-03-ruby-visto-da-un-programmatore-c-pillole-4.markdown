---
comments: true
date: 2011-07-03 12:08:18
layout: post
slug: ruby-visto-da-un-programmatore-c-pillole-4
title: Ruby visto da un programmatore C# (pillole) [4]
wordpress_id: 59
categories:
- Ruby &amp; RubyOnRails
tags:
- c#
- Ruby &amp; RubyOnRails
---

Uno dei punti forti di Ruby è la metaprogrammazione resa potente grazie al fatto che Ruby è un linguaggio interpretato e dinamico. Rails ne fa largo uso e molto del _magic_ che fornisce funziona grazie alla metaprogrammazione.




Spesso può tornare utile anche nei nostri programmi perchè ci evita di scrivere codice ripetitivo. Supponete di avere la "solita" class di settings da esporre alla vostra applicazione:






    
    public class Settings
    {
      public string ApplicationName {get; set;}
      public int Timeout {get; set;}
      // ...
      public Settings(string applicationName, int timeOut)
      {
        ApplicationName = applicationName;
        TimeOut = timeOut;
      }
    }







Il codice scritto in C# è ripetitivo e tedioso e non aggiunge grande valore all'applicazione essendo Settings una classe utility priva di logica.




In Ruby, posso sfruttare la metaprogrammazione per creare a runtime gli attributi necessari all'applicazione:






    
    class Settings
      def initialize(options)
        options.each do |key, value|
          self.instance_variable_set "@#{key}", value
          self.class.send :define_method, key, proc{self.instance_variable_get("@#{key}")}
          self.class.send :define_method, "#{key}=",proc{|value| self.instance_variable_set("@#{key}", value)}
        end
      end
    end


Il codice può apparire ai neofiti di ruby molto complesso, in realtà la complessità è dovuta più che altro alla string interpolation ("@#{key}" genera la stringa @valoreDellaVariabileKey) ma si tratta di tre righe di codice che rispettivamente impostano il valore della variabile @key a value, e creano il metodo get e il metodo set per leggere e impostare il valore.

In questa classe non c'è traccia degli attributi ApplicationName e Timeout perchè ogni attributo verrà definito a runtime tramite il seguente codice:

    
    c = Settings.new :application_name =>"bob", :time_out => 25
    puts c.application_name
    puts c.time_out









