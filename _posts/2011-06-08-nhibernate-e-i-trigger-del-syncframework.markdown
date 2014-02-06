---
comments: true
date: 2011-06-08 10:19:58
layout: post
slug: nhibernate-e-i-trigger-del-syncframework
title: NHibernate e i trigger del SyncFramework
wordpress_id: 36
categories:
- .NET, C#
tags:
- c#
- NHibernate
- SyncFramework
---

In una applicazione che stiamo sviluppando siamo ricorsi al [Sync Framework](http://msdn.microsoft.com/en-us/sync/bb736753) di Microsoft per gestire la sincronizzazione di un database SQL Compact con il database principale SQL Server 2008.

Non appena installato e configurato il sync framework l'applicazione web che utilizza sql2008 tramite nhibernate ha cominciato a dare strani e apparentemente ingiustificati errori:

    
    [NHibernate.AdoNet.TooManyRowsAffectedException]
    {"Unexpected row count: 2; expected: 1"}
    NHibernate.AdoNet.TooManyRowsAffectedException


Dopo un po' di indagini con il debugger e qualche ricerca su internet sono riuscito a scoprire il problema: il sync framework usa una serie di trigger sulle tabelle da sincronizzare e questi vanno a modificare il numero di "affected records" che NHibernate si aspetta a fronte di un update (o di una delete/insert).

La soluzione è facile se si ha controllo sui trigger ([daniele ne suggerisce una](http://blogs.ugidotnet.org/DanBlog/archive/0001/01/01/89701.aspx)) ma non essendo io il "proprietario" dei trigger non ho potuto applicarla.

Dopo un'altra sessione di ricerca ho trovato qualche indizio che mi ha portato ad aprire i sorgenti di NHibernate per indagare meglio su come vengono gestite le operazioni di update.

Il punto chiave è la classe SqlClientBatchingBatcher che manda in esecuzione una serie di comandi e verifica che il numero di affected records sia concorde con le attese.

Quindi mi sono messo a riscrivere la classe batcher partendo dalla classe astratta AbstractBatcher e ho implementato un BatchingBatcherWithoutVerification che fa esattamente quello che fa quello di default meno la verifica sugli affected record (se il dafault batcher fosse un po' più virtual avrei potuto partire dalla sua implementazione...ma non mi sembra sia possibile).

A questo punto il problema è stato agganciare la nuova classe alla configurazione dell'applicazione che usa FluentNhibernate per il mapping. Qui la cosa è stata abbastanza semplice, è bastato implementare un paio classi, una IBatcherFactory e un PersistenceConfiguration per poter configurare NHibernate all'uso del nuovo BatchingBatcherWithoutVerification.

Il codice completo delle modifiche è riportato qui sotto:

    
    public class BatchingBatcherWithoutVerification : AbstractBatcher
    {
        private int _batchSize;
        private int _totalExpectedRowsAffected;
        private SqlClientSqlCommandSet _currentBatch;
        private StringBuilder _currentBatchCommandsLog;
        private readonly int _defaultTimeout;
    
        public BatchingBatcherWithoutVerification(ConnectionManager connectionManager, IInterceptor interceptor)
            : base(connectionManager, interceptor)
        {
            _batchSize = Factory.Settings.AdoBatchSize;
            _defaultTimeout = PropertiesHelper.GetInt32(NHibernate.Cfg.Environment.CommandTimeout, NHibernate.Cfg.Environment.Properties, -1);
    
            _currentBatch = CreateConfiguredBatch();
            _currentBatchCommandsLog = new StringBuilder().AppendLine("Batch commands:");
        }
    
        public override int BatchSize
        {
            get { return _batchSize; }
            set { _batchSize = value; }
        }
    
        protected override int CountOfStatementsInCurrentBatch
        {
            get { return _currentBatch.CountOfCommands; }
        }
    
        public override void AddToBatch(IExpectation expectation)
        {
            _totalExpectedRowsAffected += expectation.ExpectedRowCount;
            IDbCommand batchUpdate = CurrentCommand;
    
            string lineWithParameters = null;
            var sqlStatementLogger = Factory.Settings.SqlStatementLogger;
            if (sqlStatementLogger.IsDebugEnabled || log.IsDebugEnabled)
            {
                lineWithParameters = sqlStatementLogger.GetCommandLineWithParameters(batchUpdate);
                var formatStyle = sqlStatementLogger.DetermineActualStyle(FormatStyle.Basic);
                lineWithParameters = formatStyle.Formatter.Format(lineWithParameters);
                _currentBatchCommandsLog.Append("command ")
                    .Append(_currentBatch.CountOfCommands)
                    .Append(":")
                    .AppendLine(lineWithParameters);
            }
            if (log.IsDebugEnabled)
            {
                log.Debug("Adding to batch:" + lineWithParameters);
            }
            _currentBatch.Append((System.Data.SqlClient.SqlCommand) batchUpdate);
    
            if (_currentBatch.CountOfCommands >= _batchSize)
            {
                ExecuteBatchWithTiming(batchUpdate);
            }
        }
    
        protected override void DoExecuteBatch(IDbCommand ps)
        {
            log.DebugFormat("Executing batch");
            CheckReaders();
            Prepare(_currentBatch.BatchCommand);
            if (Factory.Settings.SqlStatementLogger.IsDebugEnabled)
            {
                Factory.Settings.SqlStatementLogger.LogBatchCommand(_currentBatchCommandsLog.ToString());
                _currentBatchCommandsLog = new StringBuilder().AppendLine("Batch commands:");
            }
    
            int rowsAffected;
            try
            {
                rowsAffected = _currentBatch.ExecuteNonQuery();
            }
            catch (DbException e)
            {
                throw ADOExceptionHelper.Convert(Factory.SQLExceptionConverter, e, "could not execute batch command.");
            }
    
            // EMA: Disabilito il check del count
            //Expectations.VerifyOutcomeBatched(totalExpectedRowsAffected, rowsAffected);
    
            _currentBatch.Dispose();
            _totalExpectedRowsAffected = 0;
            _currentBatch = CreateConfiguredBatch();
        }
    
        private SqlClientSqlCommandSet CreateConfiguredBatch()
        {
            var result = new SqlClientSqlCommandSet();
            if (_defaultTimeout > 0)
            {
                try
                {
                    result.CommandTimeout = _defaultTimeout;
                }
                catch (Exception e)
                {
                    if (log.IsWarnEnabled)
                    {
                        log.Warn(e.ToString());
                    }
                }
            }
    
            return result;
        }
    }
    
    public class DriverWithCustomBatcherFactory : SqlClientDriver, IEmbeddedBatcherFactoryProvider
    {
        Type IEmbeddedBatcherFactoryProvider.BatcherFactoryClass
        {
            get { return typeof(MyCustomClientBatchingBatcherFactory); }
        }
    }
    
    public class MyCustomClientBatchingBatcherFactory : IBatcherFactory
    {
        public virtual IBatcher CreateBatcher(ConnectionManager connectionManager, IInterceptor interceptor)
        {
            return new BatchingBatcherWithoutVerification(connectionManager, interceptor);
        }
    }
    
    public class MyCustomSqlConfiguration : PersistenceConfiguration
    {
        MyCustomSqlConfiguration()
        {
            Driver();
            AdoNetBatchSize(1);
        }
    
        public static MyCustomConfiguration Sql2008Dialect
        {
            get
            {
                return new MyCustomConfiguration()
                    .Dialect ();
            }
        }


}



