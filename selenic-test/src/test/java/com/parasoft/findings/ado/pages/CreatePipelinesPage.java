package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.*;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class CreatePipelinesPage {
    @FindBy(xpath = "/descendant::span[normalize-space(.)='Create Pipeline']")
    private WebElement createPipelineButton;

    @FindBy(linkText = "Use the classic editor")
    private WebElement useTheClassicEditorLink;

    @FindBy(className = "ci-getting-started-continue-button")
    private WebElement continueButton;

    @FindBy(xpath = "//div[@class='repo-selector-section']//span[@class='selected-item-text']")
    private WebElement repositoryName;

    @FindBy(className = "empty-process-button")
    private WebElement applyEmptyPipelineButton;

    @FindBy(css = ".agent-queue-drop-down > .ms-ComboBox > .ms-ComboBox-CaretDown-button")
    private WebElement agentPoolCombobox;

    @FindBy(xpath = "/descendant::div[normalize-space(.)='Default']")
    private WebElement defaultAgentPool;

    @FindBy(xpath = "/descendant::i[normalize-space(.)='']")
    private WebElement addTaskButton;

    @FindBy(className = "ms-SearchBox-field")
    private WebElement searchBox;

    @FindBy(className = "dtc-task-details")
    private WebElement specificTasks;

    @FindBy(xpath = "//div[@class='dtc-task-details']//button")
    private WebElement addSpecificTasksButton;

    @FindBy(xpath = "//div[@class='phase-item-task-list-container']//div[@class='task-list-container']//div[@class='ms-List-page']/div[1]")
    private WebElement commandLineScript;

    @FindBy(xpath = "//div[@class='phase-item-task-list-container']//div[@class='task-list-container']//div[@class='ms-List-page']/div[2]")
    private WebElement publishParasoftResults;

    @FindBy(xpath = "/descendant::input[@id=/descendant::label[normalize-space()='Display name']/@for]")
    private WebElement displayNameField;

    @FindBy(xpath = "//div[@class='task-tab-right-section rightPane']//div[@class='ms-List-page']/div[1]//textarea")
    private WebElement scriptOrResultsFilesField;

    @FindBy(xpath = "//div[@class='task-tab-right-section rightPane']//div[@class='ms-List-page']/div[3]//textarea")
    private WebElement settingsField;

    @FindBy(className = "bolt-checkmark")
    private WebElement statusCheckbox;

    @FindBy(name = "Save & queue")
    private WebElement selectSaveAndQueueButton;

    @FindBy(className = "ms-ContextualMenu-itemText")
    private WebElement openSaveBuildPipeline;

    @FindBy(xpath = "/descendant::span[normalize-space(.)='Save and run']")
    private WebElement saveButton;

    private WebDriver driver;

    public CreatePipelinesPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void clickCreatePipelineButton() {
        ElementUtils.waitUntilClickable(driver, createPipelineButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, createPipelineButton);
    }

    public void clickUseTheClassicEditorLink() {
        ElementUtils.waitUntilVisible(driver, useTheClassicEditorLink, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, useTheClassicEditorLink);
    }

    public void clickContinueButton() {
        ElementUtils.waitUntilVisible(driver, repositoryName, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, continueButton);
    }

    public void clickApplyEmptyPipelineButton() {
        ElementUtils.waitUntilClickable(driver, applyEmptyPipelineButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, applyEmptyPipelineButton);
    }

    public void clickAgentPoolCombobox() {
        ElementUtils.waitUntilClickable(driver, agentPoolCombobox, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, agentPoolCombobox);
    }

    public void setDefaultAgentPool() {
        ElementUtils.waitUntilClickable(driver, defaultAgentPool, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, defaultAgentPool);
    }

    public void clickAddTaskButton() {
        ElementUtils.waitUntilClickable(driver, addTaskButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, addTaskButton);
    }

    public void setSearchBox(String text) {
        ElementUtils.waitUntilClickable(driver, searchBox, Properties.WAIT_FOR_TIMEOUT);
        searchBox.sendKeys(text);
        try {
            Thread.sleep(Properties.DELAY_TIME);
        } catch (InterruptedException e) {
            System.out.println(e.getMessage());
        }
    }

    public void clickAddSpecificTasksDetails() {
        ElementUtils.waitUntilVisible(driver, specificTasks, Properties.WAIT_FOR_TIMEOUT).click();
        ElementUtils.waitUntilVisible(driver, addSpecificTasksButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, addSpecificTasksButton);
    }

    public void clickCommandLineScript() {
        ElementUtils.waitUntilClickable(driver, commandLineScript, Properties.WAIT_FOR_TIMEOUT).click();
    }

    public void clickPublishParasoftResults() {
        ElementUtils.waitUntilClickable(driver, publishParasoftResults, Properties.WAIT_FOR_TIMEOUT).click();
    }

    public void setDisplayNameField(String text) {
        ElementUtils.waitUntilClickable(driver, displayNameField, Properties.WAIT_FOR_TIMEOUT);
        displayNameField.sendKeys(Keys.CONTROL, "a");
        displayNameField.sendKeys(text);
    }

    public void setScriptOrResultsFilesField(String text) {
        ElementUtils.waitUntilClickable(driver, scriptOrResultsFilesField, Properties.WAIT_FOR_TIMEOUT);
        scriptOrResultsFilesField.sendKeys(Keys.CONTROL, "a");
        scriptOrResultsFilesField.sendKeys(text);
    }

    public void setSettingsField(String text) {
        ElementUtils.waitUntilClickable(driver, settingsField, Properties.WAIT_FOR_TIMEOUT);
        settingsField.sendKeys(text);
    }

    public void clickStatusCheckbox() {
        ElementUtils.waitUntilClickable(driver, statusCheckbox, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, statusCheckbox);
    }

    public void clickSaveAndQueue() {
        ElementUtils.waitUntilClickable(driver, selectSaveAndQueueButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, selectSaveAndQueueButton);
        ElementUtils.waitUntilClickable(driver, openSaveBuildPipeline, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, openSaveBuildPipeline);
        ElementUtils.waitUntilClickable(driver, saveButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, saveButton);
    }
}
