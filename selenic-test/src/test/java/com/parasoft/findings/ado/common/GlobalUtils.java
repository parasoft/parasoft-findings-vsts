package com.parasoft.findings.ado.common;

import com.parasoft.findings.ado.pages.*;
import org.openqa.selenium.WebDriver;

public class GlobalUtils {
    public static void login(WebDriver driver) {
        driver.get(Properties.LOGIN_URL);

        MicrosoftLoginPage microsoftLoginPage = new MicrosoftLoginPage(driver);
        microsoftLoginPage.setLoginAccountField(Properties.LOGIN_ACCOUNT_FIELD);
        microsoftLoginPage.clickNextButton();

        microsoftLoginPage.setPasswdField(Properties.LOGIN_PASSWORD_FIELD);
        microsoftLoginPage.clickSignInButton();

        microsoftLoginPage.clickNoButton();
    }

    public static void createProject(WebDriver driver, String projectName) {
        driver.get(Properties.AZURE_URL);

        ProjectsHomePage projectsHomePage = new ProjectsHomePage(driver);
        projectsHomePage.setProjectNameInputField(projectName);
        projectsHomePage.clickCreateButton();
        projectsHomePage.clickReposTab();
    }

    public static void importRepository(WebDriver driver, String projectUrl) {
        RepositoryPage repositoryPage = new RepositoryPage(driver);
        repositoryPage.clickOpenImportRepositoryButton();
        repositoryPage.setCloneURLInputField(projectUrl);
        repositoryPage.clickAuthenticationCheckbox();
        repositoryPage.setUsernameInputField(Properties.GIT_REPOSITORY_USERNAME);
        repositoryPage.setPasswordOrPATInputField(Properties.GIT_REPOSITORY_PASSWORD_OR_PAT);
        repositoryPage.clickImportButton();
        repositoryPage.clickPipelinesTab();
    }

    public static void createPipeline(CreatePipelinesPage createPipelinesPage) {
        createPipelinesPage.clickCreatePipelineButton();
        createPipelinesPage.clickUseTheClassicEditorLink();
        createPipelinesPage.clickContinueButton();
        createPipelinesPage.clickApplyEmptyPipelineButton();
        createPipelinesPage.clickAgentPoolCombobox();
        createPipelinesPage.setDefaultAgentPool();
    }

    public static void addCommandLineTask(CreatePipelinesPage createPipelinesPage, String displayName, String command) {
        createPipelinesPage.clickAddTaskButton();
        createPipelinesPage.setSearchBox(Properties.COMMAND_LINE);
        createPipelinesPage.clickAddSpecificTasksDetails();
        createPipelinesPage.clickCommandLineScript();
        createPipelinesPage.setDisplayNameField(displayName);
        createPipelinesPage.setScriptOrResultsFilesField(command);
    }

    public static void addPublishParasoftResultsTask(CreatePipelinesPage createPipelinesPage, String displayName, String command, String settings) {
        createPipelinesPage.clickAddTaskButton();
        createPipelinesPage.setSearchBox(Properties.PUBLISH_PARASOFT_RESULTS);
        createPipelinesPage.clickAddSpecificTasksDetails();
        createPipelinesPage.clickPublishParasoftResults();
        createPipelinesPage.setDisplayNameField(displayName);
        createPipelinesPage.setScriptOrResultsFilesField(command);
        createPipelinesPage.setSettingsField(settings);
        createPipelinesPage.clickStatusCheckbox();
    }

    public static void deleteProject(WebDriver driver, String projectName) {
        ProjectSettingsPage projectSettingsPage = new ProjectSettingsPage(driver);
        projectSettingsPage.openDeleteButtonModal();
        projectSettingsPage.setDeleteProjectName(projectName);
        projectSettingsPage.clickDelete();
    }
}
