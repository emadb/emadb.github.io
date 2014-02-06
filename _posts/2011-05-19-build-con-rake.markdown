---
comments: true
date: 2011-05-19 20:08:21
layout: post
slug: build-con-rake
title: Build con Rake
wordpress_id: 17
categories:
- Ruby &amp; RubyOnRails
tags:
- CI
- Ruby &amp; RubyOnRails
---

Per parecchi anni abbiamo usato [NANT](http://nant.sourceforge.net/) e successivamente [MSBuild](http://msdn.microsoft.com/en-us/library/ms171452(v=vs.90).aspx) per effettuare le build dei nostri progetti e per parecchi anni ho odiato l'XML per la sua "prolissità" e per la poca manutenibilità. Quante build rotte a causa di un tag non chiuso, di una variabile scritta male, di un doppio apice dimenticato....

Nel nostro ultimo progetto abbiamo fatto piazza pulita e siamo ripartiti da zero con [rake](http://rake.rubyforge.org/) per provare qualcosa di diverso. Fin da subito i vantaggi sono stati notevoli.

Primo tra tutti il fatto di avere un vero linguaggio di programmazione (ad oggetti) per scrivere i vari task della build che portano ad un notevole aumento della leggibilità.

Secondo, l'uso di [IronRuby](http://www.ironruby.net/), come interprete ci permette, qualora servisse, di avere una completa interoperabilità con il .NET framework accedendo direttamente agli assembly generati per estrarre informazioni o per modificarli.

Al momento, siamo alla prima versione, il nostro file di build contiene i seguenti task:



	
  * compilazione del progetto con MSBuild

	
  * allineamento del database tramite [Tarantino](http://code.google.com/p/tarantino/)

	
  * compilazione delle viste (utilissimo)

	
  * esecuzione unit test con [xUnit.net](http://xunit.codeplex.com)

	
  * esecuzione test integrazione con xUnit.net

	
  * calcolo delle metriche con [SourceMonitor](http://www.campwoodsw.com/sourcemonitor.html)

	
  * copia del progetto nella cartella per il deploy


Inoltre ci sono un paio di task per chi non ha ancora il database che si occupano di creare il db e gli utenti necessari all'applicazione.
Il rakefile è su SVN e ogni membro del team (siamo in 3) ha installato IronRuby sulla propria macchina con la gemma rake.L'esecuzione avviene tramite riga di comando e nei prossimi giorni verrà integrato sul server di CI (TeamCity) cosi che il processo venga automatizzato.
Agli interessati, riporto di seguito il rakefile che stiamo utilizzando:


    
    
    require 'rake/clean'</span>
    # project variables
    DOT_NET_PATH = "#{ENV["SystemRoot"]}\Microsoft.NET\Framework\v4.0.30319"
    XUNIT_EXE = "xunit.console.clr4.exe"
    SOURCE_PATH = "../src"
    OUTPUT_PATH = "output"
    CONFIG = "Debug"
    DEPLOY_PATH = "./archive"
    DATABASE_SERVER = "localhost"
    DATABASE_NAME = "####"
    
    CLEAN.include(OUTPUT_PATH)
    
    # Tasks
    task :default => [:compile, :database, :create_views, :copy_to_temp, :compile_views, :unit_test, :integration_tests, :source_monitor]
    task :fast => [:compile, :unit_test]
    task :rebuild_database => [:create_database, :database, :create_views]
    
    desc "Build solutions using MSBuild"
    task :compile  do
      solutions = FileList["#{SOURCE_PATH}/**/*.sln"]
      solutions.each do |solution|
        sh "#{DOT_NET_PATH}/msbuild.exe /p:Configuration=#{CONFIG} #{solution}"
      end
    end
    
    desc "Running unit tests"
    task :unit_test do
      Dir.glob("#{SOURCE_PATH}/**/bin/#{CONFIG}/*.Fixture.dll").each do |f|
        sh "#{XUNIT_EXE} #{f}"
      end
    end
    
    desc "Running integration tests"
    task :integration_tests do
      Dir.glob("#{SOURCE_PATH}/**/bin/#{CONFIG}/*.IntegrationTests.dll").each do |f|
        sh "#{XUNIT_EXE} #{f}"
      end
    end
    
    desc "Create database"
    task :create_database do
        sh "sqlcmd -S#{DATABASE_SERVER} -dmaster -b -i ..\db\CreateDatabaseAndUsers.sql"
    end
    
    desc "Create database Views"
    task :create_views do
        Dir.glob("../db/views/*.sql").each do |f|
            sh "sqlcmd -S#{DATABASE_SERVER} -d#{DATABASE_NAME} -b -i #{f}"
        end
    end
    
    desc "Update database"
    task :database do
    	sh "Tarantino.DatabaseManager.Console.exe Update #{DATABASE_SERVER} #{DATABASE_NAME} ..\db"
    end
    
    desc "Source monitor"
    task :source_monitor do
    	sh "SourceMonitor.exe /C SourceMonitor.xml"
    end
    
    desc "Copy binaries to temp dir"
    task :copy_to_temp do
      FileUtils.cp_r "#{SOURCE_PATH}/CodicePlastico.####.Web/", "#{DEPLOY_PATH}"
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/.svn")
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/obj")
      FileUtils.rm_r "#{DEPLOY_PATH}/CodicePlastico.####.Web/obj"
      FileUtils.rm_r "#{DEPLOY_PATH}/CodicePlastico.####.Web/Controllers"
      FileUtils.rm_r "#{DEPLOY_PATH}/CodicePlastico.####.Web/Models"
      FileUtils.rm_r "#{DEPLOY_PATH}/CodicePlastico.####.Web/Properties"
      FileUtils.rm_r "#{DEPLOY_PATH}/CodicePlastico.####.Web/Services"
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/*.cs")
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/*.csproj")
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/*.user")
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/Web.Debug.config")
      FileUtils.rm_r Dir.glob("#{DEPLOY_PATH}/**/Web.Release.config")
    end
    
    desc "Build Views"
    task :compile_views  do
        sh "#{DOT_NET_PATH}/aspnet_compiler -v / -p #{DEPLOY_PATH}/CodicePlastico.####.Web/"
    end
