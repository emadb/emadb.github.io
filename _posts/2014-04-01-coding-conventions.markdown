---
layout: post
title: "Coding Conventions"
date: 2014-04-01
comments: true
categories:
---

In CodicePlastico we take the code readability very seriously and during last months we are trying to change the way we write code to made it more readable and performant.

Martin Fowler In his book about refactoring write this:

_"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."_

Everybody agree on that but, in my opinion, we must define better which kind of human should be able to read the code. Often we write code so that even our customers will be able to read it, does it make sense? Do your customer really read your code? In our opinion code is written for developers that knows the syntax of the language.

Wikipedia defines readability as:

_"Readability is the ease in which text can be read and understood. Various factors to measure readability have been used, such as "speed of perception," "perceptibility at a distance," "perceptibility in peripheral vision," "visibility," "the reflex blink technique," "rate of work" (e.g., speed of reading), "eye movements," and "fatigue in reading."_ [(wikipedia)](http://en.wikipedia.org/wiki/Readability)

So readability is also a matter of how much time we need to read code. Consider this line of C# code:

```
_wrostExamEvaluatorService.CheckPercentageForAnyActiveGroupLevel(allActiveExamList, _mainGroupServiceController.GetAllRangeForCurrentGroup(_currentUserId, groupThatShouldBeExcluded));
```

Do you consider it readable? In some sense yes, but it needs too much time to be read because is too long.

On the opposite side there are languages like [J](http://en.wikipedia.org/wiki/J_(programming_language)) (a dialect of APL) that are more concise and let you write complex algorithm with just a bunch of characters:

```
quicksort=: (($:@(<#[), (=#[), $:@(>#[)) ({~ ?@#)) ^: (1<#)
```

Is that readable or not?
Most probably not, but once you know the syntax it became more readable than other languages with cycles and ifs, and even more better than the algorithm explained in plain english.

So, during our experiments, we have decided to try to use only a single letter for the identifiers and for our class names, methods and variables, so that the previous C# code written above will became:

```
e.c(l,s.g(u,x));
```

Our experiments demonstrate that developers learn the convention very easily and we don't even need a dictionary, even if we put a brief dictionary on top of our files for newcomers developers.

Using this new methodology we have reduced the size of our programs, from megabytes to only some kilobytes and the performance, both at compile time and runtime (the compiler parse small files and it's faster).

We are planning more articles on this topic, so stay tuned.
