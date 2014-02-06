---
comments: true
date: 2011-08-09 08:05:56
layout: post
slug: asp-net-mvc-validare-un-checkbox
title: ASP.NET MVC validare un checkbox
wordpress_id: 98
categories:
- .NET, C#
tags:
- ASP.NET MVC
- CustomAttribute
- Jquery
- Validation
---

Conosciamo tutti gli attributi che possiamo mettere sulle proprietà di un modello e sappiamo che con ASP.NET MVC 3 abbiamo anche la possibilità di usare le regole di validazione client side.

Nei giorni scorsi mi è capitato di dover validare un checkbox che doveva essere obbligatorio e mi sono accorto che l'attributo Required non funzionava, o meglio, lui funzionava, ero io che non avevo capito la logica che usava.

Quando su una view creo un checkbox tramite @Html.CheckBoxFor(...) vengono creati due input, uno con valore true e uno con valore false. Questo hack serve per far si che la post invii comunque il valore al server anche se la checkbox non è selezionata (inviando false).

In questo modo un valore al server arriva sempre, quindi il RequiredAttribute, vedendo che il valore c'è, è soddisfatto e non invalida il modello.

La soluzione è quindi stata quella di creare un nuovo attributo che gestisse questo caso speciale. L'implementazione è abbastanza semplice, ne riporto uno stralcio:

    
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public class CheckRequiredAttribute : ValidationAttribute, IClientValidatable
    {
      public CheckRequiredAttribute()
      {
        ErrorMessageResourceName = "Required";
      }
      public override bool IsValid(object value)
      {
        //  verifico la presenza del valore
      }
      public IEnumerable GetClientValidationRules(ModelMetadata metadata, ControllerContext context)
      {
        return new[] { new ModelClientValidationRule() { ValidationType = "checkRequired", ErrorMessage = ErrorMessage } };
      }
    }


La parte interessante è il metodo GetClientValidationRules che indica il nome delle regole di validazione che dovranno essere aggiunte a jQuery per effettuare la validazione anche lato client.

Lato client va aggiunto questo script:

    
    $.validator.addMethod("checkRequired", function (value, element) {
      return $(element).attr('checked');
    }, "*");
    $.validator.unobtrusive.adapters.addBool('mandatory');


In pratica aggiungo una regola agli adatapters la cui logica è implementata nella funzione sopra (che verifica che il checkbox sia "ceccato"). Attenzione al nome della regola che è lo stesso indicato nell'attributo server side.

La costruzione di attributi custom è abbastanza semplice da implementare grazie all'integrazione di ASP.NET MVC 3 con jQuery.




