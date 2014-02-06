---
layout: post
title: "Web developers should stay away from Windows"
date: 2013-10-24 17:48
comments: true
categories: 
---
The more I explore Open Source world the more I ask myself why web developers are still using .NET for their web applications.

I know that some of my friends will not agree with what I'm writing, but I invite them to give a try to another platform without pre-conception, just to explore alternatives in web development.



Many of you know that have been some year that I'm investigating in different programming languages and platforms. It started some years ago with [Ruby](https://www.ruby-lang.org/), at the time of the [Ruby On Rails](http://rubyonrails.org/) hype, just to understand why so many people were so exited about Rails.
I was very skeptical, I thought that an interpreted dynamic language could not be used in a real web application. I was wrong.  I suddenly fall in love with Ruby (the programming language!) that I still use today for almost any non-related-to-work project.
After Ruby there was the time of [Node.js](http://nodejs.org), another very opinionated web framework based on javascript. This time I didn't fall in love with it, but I found it very interesting for writing high-scalable web application (and actually mind-blowing!)
Now it's the time for a functional language and I'm investigating in [Elixir](http://elixir-lang.org/) and [Erlang](http://www.erlang.org/), the first is a ruby-syntax functional language that runs on Erlang virtual machine (OTP), and the latter is the default language for the OTP.
During this period I also have the opportunity to talk with friends that uses other languages, from PHP to Python (to which I really should give a try) and most of them shows me features of their daily programming languages that are so interesting.

So what's the problem with C# and .NET?

While I still think that C# is a great language that was well designed and that evolve quite well, I also think that a good language is not enough to build a great development platform. And for web applications there are platforms that are better.
Even PHP that could appear like a silly programming language has web frameworks that speed up the development and has tons of packages that are ready to use.
We have nuget, yes, but did you compared the number? As today there are about 16k packages on nuget compared to 43k of NPM, 64k of Gems, 17k of Packagist (that start in 2011).

Whatever Microsoft (and it's community) try they are always in late, they just copy ideas from other platform and they do it well (ASP.NET MVC is a good framework) but they are late. When MS announce a new "marvelous" framework most of my friends says: "Ah…yes, it's like….". Just a copy. No innovation.

Another point is the matter of choice, if you need to develop a web application with .NET you don't have many choice it will be with [ASP.NET MVC](http://asp.net/mvc) or [NancyFx](http://nancyfx.org/) the new kids on the block. But what if you want to use an add-on on those? Yeoman for example? Or karma? Or Grunt? Most of the time they doesn't work, or you have to spend hours to configure them to run on windows.
What if you want to use ElasticSearch? What if you want to publish your application using Docker? What if you wnat to deploy to heroku? You can't!
Maybe all of these tool will be available in one or two years, but when they will be available for .NET the OSS community will be using something else that would be better that these.

Last point is on the OS. Even if mono is a good project and make you ASP.NET app run on linux few companies use it. In fact, if I want to use linux why should I bother with ASP.NET when I have tens of other framework that I can choose from. I could be wrong on this but, whatever Mono will be, will be always a porting of Microsoft stuff on Linux and it will be never like a native platform  (it's like using Rails on windows....who really use it? Almost nobody because even if it works, it surely creates headache with some gem).

So why should I choose to develop my applications with ASP.NET MVC? No reason at all. Some of you will say "My team has skills only on .NET", well, invest time in learning a new language, the web development is not on a Windows Box.

