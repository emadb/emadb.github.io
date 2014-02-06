---
layout: post
title: "ASP.NET WebApi Custom validator"
date: 2013-06-13 16:28
comments: true
categories: 
---
I'm using [ASP.NET WebApi](http://www.asp.net/web-api) for some months and even if I like them everytime I have to dig into the source code to understand some not_so_well_documented feature I'm impressed about the complexity of the implementation.
One case is the Model Binding mechanism that has at least three different complicated ways of doing a quite simple thing, another is the creation of CustomValidators, where even Google doesn't help so much.


What I had to do is to build a model validator that has a dependency on an external service to verify certain conditions.

I started creating this validator:


    public class MyCustomValidatorAttribute : ValidationAttribute
    {
        private readonly IMyService _service;

        public MyCustomValidatorAttribute(IMyService service)
        {
            _service = service;
        }

        public override bool IsValid(object value)
        {
            _service.Foo(value);
            return true;
        }
    }


The point here is that this validator depends on IMyService so I need to be able to inject the dependendency.
Delving into the WebApi source code I found the DataAnnotationsModelValidatorProvider that seemed to be a good candidate to start. In fact I had to use this class to define how the MyCustomValidatorAttribute should be created. So in the WebApiConfig class inside the register method I added this code:


    DataAnnotationsModelValidationFactory factory = (p, a) => new DataAnnotationModelValidator(
        new List<ModelValidationProvider>(), new MyCustomValidatorAttribute(new MyService())
        );
    DataAnnotationsModelValidatorProvider provider = new DataAnnotationsModelValidatorProvider();
    provider.RegisterAdapterFactory(typeof(MyCustomAttribute), factory);
    configuration.Services.Replace(typeof(ModelValidationProvider), provider);

Aside the fact that class names are so long that the above code is almost unreadable, what I did is to configure a new factory that is in charge of creating a the new model validator with its dependencies.

Easy...once discovered! 

