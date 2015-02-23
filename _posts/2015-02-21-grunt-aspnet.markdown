---
layout: post
title: "Build your ASP.NET MVC app with Grunt"
date: 2015-02-21
comments: true
categories:
---

[Grunt](http://gruntjs.com/) (and [Gulp](http://gulpjs.com/)) is a marvellous tool to automate your development and build pipeline but until few months ago it was directly tied to the node environment.
But since Microsoft is becaming more open source, some developers started to develope Grunt tasks to support the .NET pipeline.
So I tried to combine a set of developer tasks to automate an [ASP.NET MVC/WebApi](http://asp.net/mvc) project....and it works! 
I was able to watch the project folder and to start a set of tasks on every change to a file so that I can rebuild the app, publish it in a folder and refresh the browser to see what's changed.

The project structure is:

``` javascript
/src
|-- MyProject.sln
|-- package.json
|-- Gruntfile.js
|-- /MyProject
       |-- /App_Start
       |-- /assets
       |-- /Controllers
       |-- /Properties
       |-- /Views
       |-- MyProject.csproj
```

Task by task I created the Gruntfile. Here is the list of task that I used:

``` javascript
grunt.loadNpmTasks('grunt-msbuild');
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-iisexpress');
grunt.loadNpmTasks('grunt-contrib-compass');
grunt.loadNpmTasks('grunt-contrib-jshint');
grunt.loadNpmTasks('grunt-contrib-uglify');
```

- ```grunt-msbuild``` is used to compile the project. I added a watcher that monitor all the csharp files and everytime one of these change it runs the msbuild task.
- ```grunt-iisexpress``` is used to run the IISExpress local server on the web folder so that we can see the result of our changes
- ```grunt-contrib-compass``` is for compiling the SCSS/SASS files into CSS 
- ```grunt-contrib-jshint``` simply analyze the javascript files
- ```grunt-contrib-uglify``` is used to minify the javascript files

The full Gruntfile.js is [available as a gist](https://gist.github.com/emadb/906a5fee800480e079f2) feel free to use it and modify on your needs.

Consider that this works without Visual Studio so if you prefer you can use a lighweight editor like [SublimeText](http://www.sublimetext.com/3) (with [Omnisharp](http://www.omnisharp.net/))
