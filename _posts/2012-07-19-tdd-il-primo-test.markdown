---
comments: true
date: 2012-07-19 15:12:14
layout: post
slug: tdd-il-primo-test
title: TDD il primo test
wordpress_id: 381
categories:
- .NET, C#
tags:
- TDD
---

Insegnando il TDD un problema che vedo emergere subito è quello del primo test. Vedo dev come scrittori davanti allo schermo bianco in attesa di un'ispirazione.

Vi racconto come procedo io, sperando possa esservi d'aiuto.



Parto sempre da una storia che traduco in un test d'accettazione che altro non è che un test end-to-end che coinvolge tutto lo stack applicativo e che rimane rosso per un periodo più lungo di un normale unit-test.

Ad esempio, data la storia: "Come utente voglio potermi loggare al sistema e visualizzare la mia home page"

Il primo test che scriverei sarebbe una cosa simile:
    [Fact]
    public void Login_success_user_should_be_redirected_to_his_home_page()
    {
      LoginController controller = Container.Resolve("LoginController");
      RedirectToRouteResult result = controller.Post("ema", "password");

      Assert.Equal("Home", result.RouteValues["controller"]);
      Assert.Equal("Index", result.RouteValues["action"]);
      Assert.Equal("ema", result.RouteValues["user"]);
    }

Come potete vedere quello che sto testando è l'intero stack applicativo (in realtà grazie al self-hosting avrei potuto testare anche il routing e il model-binding). Dal container mi faccio tornare l'istanza del controller e su di esso chiamo la action Post per fare il login, quello che verifico è il risultato. Se a fronte di un login ci fosse la richiesta di loggare sul database il fatto che l'utente sia entrato aggiungeri al test una query per verificare la presenza del record sul db.

Questo test prevede che tutto lo stack sia pronto, dal controller fino al database. Per questo, se lavoriamo in TDD questo test rimane rosso per un bel po', quindi rappresenta un obbiettivo a più lungo termine rispetto ad uno unit test.

A questo punto il prossimo step è scomporre questo test in piccoli unit test scritti in TDD e arrivare a costruire l'intero stack fino al momento in cui il test sopra diventa verde.

Per partire scriverei il seguente test:
    [Fact]
    public void Post_should_verify_the_credential_using_the_user_service()
    {
      Mock service = new Mock();
      LoginController controller = new LoginController(service.Object);
      controller.Post("ema", "password");

      service.Verify(s => s.CheckUserCredentials("ema", "password"));
    }
Questo è un test di interazione che verifica la collaborazione tra il controller e il servizio, non fa nessuna verifica sul risultato dell'operazione, ma controlla solo la presenza della chiamata al servizio.

Questo test probabilmente dopo qualche iterazione può essere cancellato (probabilmente quando si va a testare il successo del login e le credenziali errate). Non è comunque un test inutile in questo momento perchè ci da un punto di partenza su cui costruire i test successivi.

Quindi, a parte il test di accettazione che ci da l'obbiettivo da raggiungere, il primo unit-test può essere una cosa semplice anche banale (testare un costrutture), non abbiate paura di scriverlo e non abbiate paura di cancellarlo poco dopo se non serve più.
