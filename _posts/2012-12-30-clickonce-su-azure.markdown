---
comments: true
date: 2012-12-30 13:00:17
layout: post
slug: clickonce-su-azure
title: 'Clickonce su azure '
wordpress_id: 489
---

Ultimamente ci è capitato di scrivere ancora un'applicazione con WPF e di dover integrare nel processo di build la pubblicazione del pacchetto clickonce su Azure per poter effettuare il deploy. Fortunatamente lo sconfinato mondo  di ruby mette a disposizione una gemma per poter interagire con il blobstorage di Azure, cosi il nostro file [rake](http://blog.codiceplastico.com/ema/?p=17) si arricchisce di questi task.




    desc 'create the clickonce package'
    task :clickonce => [:assemblyinfo] do
      solutions = FileList["#{SOURCE_PATH}/**/*.sln"]
      solutions.each do |solution|
        sh "#{DOT_NET_PATH}/msbuild.exe /target:publish /p:configuration=#{@config};ApplicationVersion=#{ENV['current_version']} #{solution}"
      end

      # copy file to app directory
      target = "Deploy"
      FileUtils.mkdir_p(target)
      Dir.glob("#{SOURCE_PATH}/CodicePlastico.Wkdo.App/bin/#{@config}/app.publish/*") do |file|
        FileUtils.cp_r(file, target)
      end
    end

    desc 'publish to azure'
    task :publish => [:clickonce] do
      WAZ::Storage::Base.establish_connection!(:account_name => 'app_name',:access_key => 'your_secret_key')
      container = WAZ::Blobs::Container.find('your_container_name')
      container['CodicePlastico.Wkdo.App.application'].destroy! unless container['CodicePlastico.Wkdo.App.application'].nil?
      container['setup.exe'].destroy! unless container['setup.exe'].nil?

      mimes = {'.deploy' => 'application/octet-stream', '.application' => 'application/x-ms-application', '.exe' => 'application/x-msdownload', '.manifest' => 'application/x-ms-application'}

      Dir.chdir("deploy/")
      Dir.glob("**/*.*") do |f|
        if !File.directory?(f)
          contents = open(f, "rb") {|io| io.read }
          container.store(f, contents, mimes[File.extname(f)])
        end
      end
    end


La gemma che abbiamo utilizzato è WAZ-storage che potete trovare [qui](https://github.com/johnnyhalife/waz-storage).
