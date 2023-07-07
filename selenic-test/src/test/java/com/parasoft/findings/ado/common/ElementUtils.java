package com.parasoft.findings.ado.common;

import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.StaleElementReferenceException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

import static org.openqa.selenium.support.ui.ExpectedConditions.elementToBeClickable;
import static org.openqa.selenium.support.ui.ExpectedConditions.visibilityOf;

public class ElementUtils {
    public static WebElement waitUntilClickable(WebDriver driver, WebElement element, long timeOutInSeconds) {
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(timeOutInSeconds));
        wait.ignoring(StaleElementReferenceException.class);
        return wait.until(elementToBeClickable(element));
    }

    public static WebElement waitUntilVisible(WebDriver driver, WebElement element, long timeOutInSeconds) {
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(timeOutInSeconds));
        wait.ignoring(StaleElementReferenceException.class);
        return wait.until(visibilityOf(element));
    }

    public static void clickElementUseJs(WebDriver driver, WebElement element) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("arguments[0].scrollIntoView(true);", element);
        js.executeScript("arguments[0].click();",element);
    }

    public static void waitUntilElementTextAppear(WebDriver driver, WebElement element, String text, long timeOutInSeconds) {
        WebDriverWait wait = new WebDriverWait(driver,Duration.ofSeconds(timeOutInSeconds));
        wait.until(ExpectedConditions.textToBePresentInElement(element, text));
        wait.until(visibilityOf(element));
    }

    public static void scrollTo(WebElement element, WebDriver driver) {
        JavascriptExecutor executor = (JavascriptExecutor) driver;
        executor.executeScript("arguments[0].scrollIntoView(false);", element);
    }
}