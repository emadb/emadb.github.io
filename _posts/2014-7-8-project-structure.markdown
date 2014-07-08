---
layout: post
title: "Projects structure"
date: 2014-05-26
comments: true
categories:
---

Frameworks like [ASP.NET MVC](http://asp.net), [Rails](http://rubyonrails.com) & C. impose you a strict folder structure using a "topology approach". This means that files of same types are in the same folder. So you end up with a Controllers folder that contains tens of files that are uncorrelated since ControllerA doesn't have anything to do with ControllerB. Even worse the correlated files, for example the ModelA, are in a completely different folder mixed with other tens of uncorrelated files.
Topology organization is the most used, I saw folders named Enums, Interfaces and Constants and it was very very difficult find the needed things.

Starting from one of the last project I tried a completely different approach, I'm using a functional organization creating a folder for every module of my application putting in each folder the complete structure (Controllers, Models, Views, etc). 

####ContractModule
  * Controllers
  * Views
  * Models
  * Others...


####CallCenterModule
  * Controllers
  * Views
  * Models
  * Others...

Doing this way I obtain a modular application and each folder is actually a micro-application that contains all that it needs to run and to be maintained. It's easier to find the needed files and eventually move components out of the main project.
Usually there is also a "Common folder" that contains the cross-module assets (extension methods, directives in case of [angularjs](http://angularjs.com), global filters and so on)
