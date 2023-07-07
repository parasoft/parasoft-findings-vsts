package com.parasoft.findings.ado.pages;

import com.parasoft.findings.ado.common.ElementUtils;
import com.parasoft.findings.ado.common.Properties;
import org.openqa.selenium.*;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class ProjectSettingsPage {

    @FindBy(xpath = "/descendant::button[normalize-space(.)='Delete']")
    private WebElement openDeleteButton;

    @FindBy(css = ".delete-button-text-field > .bolt-textfield-input")
    private WebElement projectName;

    @FindBy(xpath = "/descendant::span[normalize-space(.)='Delete']")
    private WebElement deleteButton;

    private WebDriver driver;

    public ProjectSettingsPage(WebDriver driver) {
        this.driver = driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(Properties.WAIT_FOR_TIMEOUT));
        wait.ignoring(StaleElementReferenceException.class);
        PageFactory.initElements(driver, this);
    }

    public void openDeleteButtonModal() {
        ElementUtils.waitUntilClickable(driver, openDeleteButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, openDeleteButton);
    }


    public void setDeleteProjectName(String text) {
        ElementUtils.waitUntilVisible(driver, projectName, Properties.WAIT_FOR_TIMEOUT);
        projectName.sendKeys(text);
    }

    public void clickDelete() {
        ElementUtils.waitUntilClickable(driver, deleteButton, Properties.WAIT_FOR_TIMEOUT);
        ElementUtils.clickElementUseJs(driver, deleteButton);
    }
}